import { initOTEL, shutdownOTEL } from "./observability/otel";

// Initialize OpenTelemetry before loading instrumented modules.
initOTEL();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { getConfig } from "./config";
import { createRouter } from "./http/router";
import { initWsServer } from "./ws/server";
import { registerInstance } from "./storage/instanceRegistry";
import logger from "./observability/logger";
import { collectDefaultMetrics } from "prom-client";

async function startServer() {
  const config = getConfig();
  const app = express();
  const server = createServer(app);

  // Instance Registry
  await registerInstance();

  // Observability
  collectDefaultMetrics();

  // Security
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
  }));

  // Router
  app.use(createRouter());

  // WebSocket Server
  await initWsServer(server);

  server.listen(config.port, () => {
    logger.info({ port: config.port }, "Gateway service started");
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down gateway...");
    shutdownOTEL().catch((err) => logger.error({ err }, "Failed to shut down OpenTelemetry"));
    server.close(() => {
      logger.info("Gateway server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((err) => {
  logger.error({ err }, "Failed to start Gateway service");
  process.exit(1);
});
