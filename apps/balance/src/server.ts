import * as dotenv from "dotenv";
dotenv.config();

import { startObservability, stopObservability } from "./observability";
startObservability();

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

async function start() {
  const config = getConfig();

  // Start HTTP server
  httpServer = app.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, "Balance HTTP server listening");
  });

  // Start gRPC server
  try {
    await startGrpcServer(config.grpcPort);
  } catch (error) {
    logger.error({ err: error }, "Failed to start gRPC server");
    process.exit(1);
  }

  // Start metrics server
  metricsServer = startMetricsServer(config.metricsPort);

  // Start background jobs
  startReservationExpiryJob();
  startLedgerVerificationJob();

  logger.info("Balance service started successfully");
}

async function shutdown() {
  logger.info("Shutting down balance service...");

  // Stop background jobs
  stopReservationExpiryJob();
  stopLedgerVerificationJob();

  // Stop gRPC server
  stopGrpcServer();

  // Stop HTTP server
  if (httpServer) {
    httpServer.close();
  }

  if (metricsServer) {
    metricsServer.close();
    metricsServer = null;
  }

  // Close Redis connection
  await closeRedisClient();

  await stopObservability();

  logger.info("Balance service shut down complete");
  process.exit(0);
}

// Only start if this is the main module
if (require.main === module) {
  // Handle shutdown signals
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the service
  start().catch((error) => {
    logger.error({ err: error }, "Failed to start balance service");
    process.exit(1);
  });
}

export { app, start, shutdown };
