import * as dotenv from "dotenv";
dotenv.config();

import { startObservability, stopObservability } from "./observability";
// Start observability before other imports to ensure auto-instrumentation works
startObservability();

import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { SubscriptionStore } from "./storage/subscriptionStore";
import { PushSenderService } from "./services/pushSenderService";
import { SubscriptionService } from "./services/subscriptionService";
import { EventConsumer } from "./services/eventConsumer";
import { closeRedisClient } from "./storage/redisClient";
import { getConfig } from "./config";
import { startMetricsServer } from "./observability/metrics";
import logger from "./observability/logger";

let metricsServer: ReturnType<typeof startMetricsServer> | null = null;
let eventConsumerInstance: EventConsumer | null = null;

export async function main() {
  const config = getConfig();

  const subscriptionStore = new SubscriptionStore();
  const subscriptionService = new SubscriptionService(subscriptionStore);
  const pushService = new PushSenderService(subscriptionStore);
  const eventConsumer = new EventConsumer(pushService);
  eventConsumerInstance = eventConsumer;

  try {
    // Start gRPC server
    await startGrpcServer(config.grpcPort, subscriptionService, pushService);

    // Start metrics server
    metricsServer = startMetricsServer(config.metricsPort);

    // Start event consumer
    await eventConsumer.start();

    logger.info({ port: config.grpcPort }, "Notify Service is running");
    return { subscriptionStore, subscriptionService, pushService, eventConsumer };
  } catch (error) {
    logger.error({ err: error }, "Failed to start Notify Service");
    throw error;
  }
}

export async function shutdown() {
  logger.info("Shutting down Notify Service");
  stopGrpcServer();
  if (eventConsumerInstance) {
    eventConsumerInstance.stop();
    eventConsumerInstance = null;
  }
  if (metricsServer) {
    metricsServer.close();
    metricsServer = null;
  }
  await closeRedisClient();
  await stopObservability();
}

if (process.env.NODE_ENV !== "test") {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Notify Service failed");
    process.exit(1);
  };

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  main().catch(handleFatal);
}
