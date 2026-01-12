import express from "express";
import { getConfig } from "./config";
import router from "./api/http/router";
import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { startReservationExpiryJob, stopReservationExpiryJob } from "./jobs/reservationExpiry";
import { startLedgerVerificationJob, stopLedgerVerificationJob } from "./jobs/ledgerVerification";
import { closeRedisClient } from "./storage/redisClient";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use(router);

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  }
);

let httpServer: ReturnType<typeof app.listen> | null = null;

async function start() {
  const config = getConfig();

  // Start HTTP server
  httpServer = app.listen(config.httpPort, () => {
    console.log(`Balance service HTTP server listening on port ${config.httpPort}`);
  });

  // Start gRPC server
  try {
    await startGrpcServer(config.grpcPort);
  } catch (error) {
    console.error("Failed to start gRPC server:", error);
    process.exit(1);
  }

  // Start background jobs
  startReservationExpiryJob();
  startLedgerVerificationJob();

  console.log("Balance service started successfully");
}

async function shutdown() {
  console.log("Shutting down balance service...");

  // Stop background jobs
  stopReservationExpiryJob();
  stopLedgerVerificationJob();

  // Stop gRPC server
  stopGrpcServer();

  // Stop HTTP server
  if (httpServer) {
    httpServer.close();
  }

  // Close Redis connection
  await closeRedisClient();

  console.log("Balance service shut down complete");
  process.exit(0);
}

// Only start if this is the main module
if (require.main === module) {
  // Handle shutdown signals
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the service
  start().catch((error) => {
    console.error("Failed to start balance service:", error);
    process.exit(1);
  });
}

export { app, start, shutdown };
