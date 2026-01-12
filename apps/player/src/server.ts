import * as dotenv from "dotenv";
dotenv.config();

import { startObservability, stopObservability } from "./observability";
startObservability();

import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { EventConsumer } from "./services/eventConsumer";
import { closeRedisClient } from "./storage/redisClient";
import { getConfig } from "./config";
import { startMetricsServer } from "./observability/metrics";
import logger from "./observability/logger";
import pool from "./storage/db";

let metricsServer: ReturnType<typeof startMetricsServer> | null = null;
let eventConsumerInstance: EventConsumer | null = null;

export async function main() {
  const config = getConfig();

  try {
    await startGrpcServer(config.grpcPort);
    metricsServer = startMetricsServer(config.metricsPort);

    const consumer = new EventConsumer();
    eventConsumerInstance = consumer;
    await consumer.start();

    logger.info({ port: config.grpcPort }, "Player Service is running");
  } catch (error: unknown) {
    logger.error({ err: error }, "Failed to start Player Service");
    throw error;
  }
}

export async function shutdown() {
  logger.info("Shutting down Player Service");
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
  await pool.end();
  await stopObservability();
}

if (process.env.NODE_ENV !== "test") {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Player Service failed");
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
