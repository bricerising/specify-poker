import { startObservability, stopObservability } from "./observability";
// Start observability before other imports to ensure auto-instrumentation works
startObservability();

import { createShutdownManager } from "@specify-poker/shared";
import { config } from "./config";
import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { connectRedis, closeRedisClient } from "./storage/redisClient";
import { startMetricsServer } from "./observability/metrics";
import logger from "./observability/logger";

let metricsServer: ReturnType<typeof startMetricsServer> | null = null;

const shutdownManager = createShutdownManager({ logger });
shutdownManager.add("otel.shutdown", async () => {
  await stopObservability();
});
shutdownManager.add("redis.close", async () => {
  await closeRedisClient();
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

export async function main() {
  try {
    await connectRedis();
    logger.info("Connected to Redis");

    await startGrpcServer(config.port);
    logger.info({ port: config.port }, "Game Service gRPC server started");

    metricsServer = startMetricsServer(config.metricsPort);

    logger.info("Game Service is running");
  } catch (err: unknown) {
    logger.error({ err }, "Failed to start Game Service");
    await shutdownManager.run();
    throw err;
  }
}

export async function shutdown() {
  logger.info("Shutting down Game Service");
  await shutdownManager.run();
}

const isDirectRun =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

if (isDirectRun && process.env.NODE_ENV !== "test") {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Game Service failed");
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
