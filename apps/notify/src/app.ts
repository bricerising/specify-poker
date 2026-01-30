import { closeHttpServer } from '@specify-poker/shared';
import type { Config } from './config';
import { createGrpcServer } from './api/grpc/server';
import logger from './observability/logger';
import { startMetricsServer } from './observability/metrics';
import { EventConsumer } from './services/eventConsumer';
import { createGameEventHandlers } from './services/gameEventHandlers';
import { createNotifyService, type NotifyService } from './services/notifyService';
import { createPushSubsystem } from './services/pushSubsystem';
import type { PushSenderService } from './services/pushSenderService';
import { configureVapid } from './services/webPushClient';
import { SubscriptionService } from './services/subscriptionService';
import { createAsyncLifecycle } from './shared/asyncLifecycle';
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
};

export function createNotifyApp(options: CreateNotifyAppOptions): NotifyApp {
  const redis =
    options.redis ?? createRedisClientManager({ url: options.config.redisUrl, log: logger });
  const subscriptionStore = new SubscriptionStore({ getClient: () => redis.getClient() });
  const subscriptionService = new SubscriptionService(subscriptionStore);

  configureVapid({
    subject: options.config.vapidSubject,
    publicKey: options.config.vapidPublicKey,
    privateKey: options.config.vapidPrivateKey,
  });

  const { pushSenderService, pushSender } = createPushSubsystem({ subscriptionStore });
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

  const stopInternal = async (): Promise<void> => {
    grpcServer.stop();
    await eventConsumer.stop();
    if (metricsServer) {
      await closeHttpServer(metricsServer);
      metricsServer = null;
    }
    await redis.close();
  };

  const startInternal = async (): Promise<void> => {
    try {
      await grpcServer.start();
      metricsServer = startMetricsServer(options.config.metricsPort);
      await eventConsumer.start();
    } catch (error: unknown) {
      await stopInternal();
      throw error;
    }
  };

  const lifecycle = createAsyncLifecycle({ start: startInternal, stop: stopInternal });

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
