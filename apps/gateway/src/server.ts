import express from "express";
import cors from "cors";
import { createServer } from "http";
import { getConfig } from "./config";
import { createRouter } from "./http/router";
import { initWsServer } from "./ws/server";
import { initOTEL } from "./observability/otel";
import { registerInstance } from "./storage/instanceRegistry";
import logger from "./observability/logger";
import { collectDefaultMetrics } from "prom-client";

async function startServer() {
  // Initialize OTEL before anything else
  initOTEL();

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
