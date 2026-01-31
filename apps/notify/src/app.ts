import {
  closeHttpServer,
  createAsyncLifecycle,
  createServiceBootstrapBuilder,
} from '@specify-poker/shared';
import type { Config } from './config';
import { createGrpcServer } from './api/grpc/server';
import logger from './observability/logger';
import { startMetricsServer } from './observability/metrics';
import { EventConsumer } from './services/eventConsumer';
import { createGameEventHandlers } from './services/gameEventHandlers';
import { createNotifyService, type NotifyService } from './services/notifyService';
import { createPushSubsystem } from './services/pushSubsystem';
import type { PushSenderService } from './services/pushSenderService';
import {
  createWebPushClient,
  type VapidDetails,
  type WebPushClient,
} from './services/webPushClient';
import { SubscriptionService } from './services/subscriptionService';
import { createRedisClientManager, type RedisClientManager } from './storage/redisClient';
import { SubscriptionStore } from './storage/subscriptionStore';

export type NotifyApp = {
  services: {
    subscriptionStore: SubscriptionStore;
    subscriptionService: SubscriptionService;
    pushSenderService: PushSenderService;
    notifyService: NotifyService;
    eventConsumer: EventConsumer;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type CreateNotifyAppOptions = {
  config: Config;
  redis?: RedisClientManager;
  webPushClient?: WebPushClient;
};

export function createNotifyApp(options: CreateNotifyAppOptions): NotifyApp {
  const redis =
    options.redis ?? createRedisClientManager({ url: options.config.redisUrl, log: logger });
  const subscriptionStore = new SubscriptionStore({ getClient: () => redis.getClient() });
  const subscriptionService = new SubscriptionService(subscriptionStore);

  const vapidDetails: VapidDetails = {
    subject: options.config.vapidSubject,
    publicKey: options.config.vapidPublicKey,
    privateKey: options.config.vapidPrivateKey,
  };

  const webPushClient = options.webPushClient ?? createWebPushClient({ vapidDetails });
  const { pushSenderService, pushSender } = createPushSubsystem({
    subscriptionStore,
    webPushClient,
  });
  const notifyService = createNotifyService({ subscriptionService, pushSender });
  const eventConsumer = new EventConsumer(createGameEventHandlers(pushSender), {
    streamKey: options.config.eventStreamKey,
    getRedisClient: () => redis.getBlockingClient(),
  });

  const grpcServer = createGrpcServer({
    port: options.config.grpcPort,
    notifyService,
  });

  let metricsServer: ReturnType<typeof startMetricsServer> | null = null;

  const bootstrap = createServiceBootstrapBuilder({ logger, serviceName: 'notify.app' })
    .step('redis.close', ({ onShutdown }) => {
      onShutdown('redis.close', async () => {
        await redis.close();
      });
    })
    .step('grpc.server.start', async ({ onShutdown }) => {
      await grpcServer.start();
      onShutdown('grpc.stop', () => {
        grpcServer.stop();
      });
    })
    .step('metrics.start', ({ onShutdown }) => {
      metricsServer = startMetricsServer(options.config.metricsPort);
      onShutdown('metrics.close', async () => {
        if (!metricsServer) {
          return;
        }
        await closeHttpServer(metricsServer);
        metricsServer = null;
      });
    })
    .step('eventConsumer.start', async ({ onShutdown }) => {
      await eventConsumer.start();
      onShutdown('eventConsumer.stop', async () => {
        await eventConsumer.stop();
      });
    })
    .build({
      run: async () => undefined,
      onStartWhileRunning: 'throw',
    });

  const lifecycle = createAsyncLifecycle({
    start: async () => {
      await bootstrap.main();
    },
    stop: async () => {
      await bootstrap.shutdown();
    },
  });

  return {
    services: {
      subscriptionStore,
      subscriptionService,
      pushSenderService,
      notifyService,
      eventConsumer,
    },
    start: lifecycle.start,
    stop: lifecycle.stop,
  };
}
