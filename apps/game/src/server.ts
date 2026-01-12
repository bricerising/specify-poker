import { startObservability, stopObservability } from "./observability";
// Start observability before other imports to ensure auto-instrumentation works
startObservability();

import { config } from "./config";
import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { connectRedis, closeRedisClient } from "./storage/redisClient";
import { startMetricsServer } from "./observability/metrics";
import logger from "./observability/logger";

let metricsServer: ReturnType<typeof startMetricsServer> | null = null;

export async function main() {
  try {
    await connectRedis();
    logger.info("Connected to Redis");

    await startGrpcServer(config.port);
    logger.info({ port: config.port }, "Game Service gRPC server started");

    metricsServer = startMetricsServer(config.metricsPort);

    logger.info("Game Service is running");
  } catch (err) {
    logger.error({ err }, "Failed to start Game Service");
    process.exit(1);
  }
}

export async function shutdown() {
  logger.info("Shutting down Game Service");
  stopGrpcServer();
  if (metricsServer) {
    metricsServer.close();
    metricsServer = null;
  }
  await closeRedisClient();
  await stopObservability();
}

if (process.env.NODE_ENV !== "test") {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Game Service failed");
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
