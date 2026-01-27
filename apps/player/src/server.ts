import * as dotenv from "dotenv";
dotenv.config();

import { startObservability, stopObservability } from "./observability";
startObservability();

import { createShutdownManager } from "@specify-poker/shared";
import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { EventConsumer } from "./services/eventConsumer";
import { startDeletionProcessor, stopDeletionProcessor } from "./jobs/deletionProcessor";
import { closeRedisClient } from "./storage/redisClient";
import { getConfig } from "./config";
import { startMetricsServer } from "./observability/metrics";
import logger from "./observability/logger";
import pool from "./storage/db";
import { runMigrations } from "./storage/migrations";

let metricsServer: ReturnType<typeof startMetricsServer> | null = null;
let eventConsumerInstance: EventConsumer | null = null;

const shutdownManager = createShutdownManager({ logger });
shutdownManager.add("otel.shutdown", async () => {
  await stopObservability();
});
shutdownManager.add("redis.close", async () => {
  await closeRedisClient();
});
shutdownManager.add("db.close", async () => {
  await pool.end();
});
shutdownManager.add("grpc.stop", () => {
  stopGrpcServer();
});
shutdownManager.add("metrics.close", () => {
  if (metricsServer) {
    metricsServer.close();
    metricsServer = null;
  }
});
shutdownManager.add("eventConsumer.stop", () => {
  eventConsumerInstance?.stop();
  eventConsumerInstance = null;
});
shutdownManager.add("deletionProcessor.stop", () => {
  stopDeletionProcessor();
});

export async function main() {
  const config = getConfig();

  try {
    await runMigrations();
    await startGrpcServer(config.grpcPort);
    metricsServer = startMetricsServer(config.metricsPort);

    const consumer = new EventConsumer();
    eventConsumerInstance = consumer;
    await consumer.start();

    // Start background jobs
    startDeletionProcessor();

    logger.info({ port: config.grpcPort }, "Player Service is running");
  } catch (error: unknown) {
    logger.error({ err: error }, "Failed to start Player Service");
    await shutdownManager.run();
    throw error;
  }
}

export async function shutdown() {
  logger.info("Shutting down Player Service");
  await shutdownManager.run();
}

const isDirectRun =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

if (isDirectRun && process.env.NODE_ENV !== "test") {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Player Service failed");
    shutdown().finally(() => process.exit(1));
  };

  process.on("uncaughtException", handleFatal);
  process.on("unhandledRejection", handleFatal);

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  main().catch(handleFatal);
}
