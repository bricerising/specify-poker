import { startObservability, stopObservability } from "./observability";
if (require.main === module) {
  startObservability();
}

import { createShutdownManager } from "@specify-poker/shared";
import express from "express";
import { getConfig } from "./config";
import router from "./api/http/router";
import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { startReservationExpiryJob, stopReservationExpiryJob } from "./jobs/reservationExpiry";
import { startLedgerVerificationJob, stopLedgerVerificationJob } from "./jobs/ledgerVerification";
import { closeRedisClient } from "./storage/redisClient";
import { recordHttpRequest, startMetricsServer } from "./observability/metrics";
import logger from "./observability/logger";

const app = express();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.originalUrl.split("?")[0];
    recordHttpRequest(req.method, route, res.statusCode, Date.now() - startedAt);
  });
  next();
});

// Routes
app.use(router);

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err, path: req.path }, "Unhandled error");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  }
);

let httpServer: ReturnType<typeof app.listen> | null = null;
let metricsServer: ReturnType<typeof startMetricsServer> | null = null;

const shutdownManager = createShutdownManager({ logger });
shutdownManager.add("otel.shutdown", async () => {
  await stopObservability();
});
shutdownManager.add("redis.close", async () => {
  await closeRedisClient();
});
shutdownManager.add("metrics.close", async () => {
  const server = metricsServer;
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
  metricsServer = null;
});
shutdownManager.add("http.close", async () => {
  const server = httpServer;
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
  httpServer = null;
});
shutdownManager.add("grpc.stop", () => {
  stopGrpcServer();
});
shutdownManager.add("jobs.stop", () => {
  stopReservationExpiryJob();
  stopLedgerVerificationJob();
});

export async function start() {
  const config = getConfig();

  try {
    // Start HTTP server
    httpServer = app.listen(config.httpPort, () => {
      logger.info({ port: config.httpPort }, "Balance HTTP server listening");
    });

    // Start gRPC server
    await startGrpcServer(config.grpcPort);

    // Start metrics server
    metricsServer = startMetricsServer(config.metricsPort);

    // Start background jobs
    startReservationExpiryJob();
    startLedgerVerificationJob();

    logger.info("Balance service started successfully");
  } catch (error: unknown) {
    logger.error({ err: error }, "Failed to start balance service");
    await shutdownManager.run();
    throw error;
  }
}

export async function shutdown() {
  logger.info("Shutting down balance service...");
  await shutdownManager.run();
  logger.info("Balance service shut down complete");
}

// Only start if this is the main module
if (require.main === module) {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Balance service failed");
    shutdown().finally(() => process.exit(1));
  };

  process.on("uncaughtException", handleFatal);
  process.on("unhandledRejection", handleFatal);

  // Handle shutdown signals
  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  // Start the service
  start().catch(handleFatal);
}

export { app };
