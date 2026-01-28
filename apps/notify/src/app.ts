import { closeHttpServer } from "@specify-poker/shared";
import type { Config } from "./config";
import { createGrpcServer } from "./api/grpc/server";
import logger from "./observability/logger";
import { startMetricsServer } from "./observability/metrics";
import { EventConsumer } from "./services/eventConsumer";
import { PushSenderService } from "./services/pushSenderService";
import { configureVapid, createWebPushClient } from "./services/webPushClient";
import { SubscriptionService } from "./services/subscriptionService";
import { createRedisClientManager, type RedisClientManager } from "./storage/redisClient";
import { SubscriptionStore } from "./storage/subscriptionStore";

export type NotifyApp = {
  services: {
    subscriptionStore: SubscriptionStore;
    subscriptionService: SubscriptionService;
    pushService: PushSenderService;
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
  const redis = options.redis ?? createRedisClientManager({ url: options.config.redisUrl, log: logger });
  const subscriptionStore = new SubscriptionStore({ getClient: redis.getClient });
  const subscriptionService = new SubscriptionService(subscriptionStore);

  configureVapid({
    subject: options.config.vapidSubject,
    publicKey: options.config.vapidPublicKey,
    privateKey: options.config.vapidPrivateKey,
  });

  const pushService = new PushSenderService(subscriptionStore, createWebPushClient());
  const eventConsumer = new EventConsumer(pushService, {
    streamKey: options.config.eventStreamKey,
    getRedisClient: redis.getBlockingClient,
  });

  const grpcServer = createGrpcServer({
    port: options.config.grpcPort,
    subscriptionService,
    pushService,
  });

  let metricsServer: ReturnType<typeof startMetricsServer> | null = null;
  let isStarted = false;

  const stop = async (): Promise<void> => {
    grpcServer.stop();
    await eventConsumer.stop();
    if (metricsServer) {
      await closeHttpServer(metricsServer);
      metricsServer = null;
    }
    await redis.close();
    isStarted = false;
  };

  const start = async (): Promise<void> => {
    if (isStarted) {
      return;
    }

    try {
      await grpcServer.start();
      metricsServer = startMetricsServer(options.config.metricsPort);
      await eventConsumer.start();
      isStarted = true;
    } catch (error: unknown) {
      await stop();
      throw error;
    }
  };

  return {
    services: { subscriptionStore, subscriptionService, pushService, eventConsumer },
    start,
    stop,
  };
}
