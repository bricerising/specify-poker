import { startObservability } from "./observability";
// Start observability before other imports to ensure auto-instrumentation works
startObservability();

import { startGrpcServer } from "./api/grpc/server";
import { runMigrations } from "./storage/migrations";
import { connectRedis } from "./storage/redisClient";
import { handMaterializer } from "./jobs/handMaterializer";
import { archiver } from "./jobs/archiver";
import { config } from "./config";
import logger from "./observability/logger";
import { startMetricsServer } from "./observability/metrics";

export async function main() {
  try {
    // Run DB migrations
    if (process.env.NODE_ENV !== "test") {
      await runMigrations();
    }

    // Connect to Redis
    await connectRedis();

    // Start background jobs
    if (process.env.NODE_ENV !== "test") {
      await handMaterializer.start();
      await archiver.start();
    }

    // Start metrics server
    if (process.env.NODE_ENV !== "test") {
      startMetricsServer(config.metricsPort);
    }

    // Start gRPC server
    await startGrpcServer(config.grpcPort);

    logger.info({ port: config.grpcPort }, "Event Service is running");
  } catch (error) {
    logger.error({ error }, "Failed to start Event Service");
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
}

if (process.env.NODE_ENV !== "test") {
  main();
}
