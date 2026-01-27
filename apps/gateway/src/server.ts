import { initOTEL, shutdownOTEL } from "./observability/otel";

const IS_DIRECT_RUN =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

const IS_TEST_ENV = process.env.NODE_ENV === "test";

// Initialize OpenTelemetry before loading instrumented modules.
if (IS_DIRECT_RUN && !IS_TEST_ENV) {
  initOTEL();
}

import { createShutdownManager, type ShutdownManager } from "@specify-poker/shared";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import type { Server } from "http";
import { getConfig } from "./config";
import { createRouter } from "./http/router";
import { initWsServer } from "./ws/server";
import { closeWsPubSub } from "./ws/pubsub";
import { registerInstance, unregisterInstance } from "./storage/instanceRegistry";
import { closeRedisClient } from "./storage/redisClient";
import logger from "./observability/logger";
import { collectDefaultMetrics } from "prom-client";

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

let runningShutdown: ShutdownManager | null = null;

export async function startServer(): Promise<void> {
  const config = getConfig();
  const app = express();
  const server = createServer(app);

  const shutdown = createShutdownManager({ logger });
  runningShutdown = shutdown;
  shutdown.add("otel.shutdown", async () => {
    await shutdownOTEL();
  });
  shutdown.add("redis.close", async () => {
    await closeRedisClient();
  });
  shutdown.add("ws.pubsub.close", async () => {
    await closeWsPubSub();
  });
  shutdown.add("http.close", async () => {
    await closeHttpServer(server);
  });

  // Instance Registry
  await registerInstance();
  shutdown.add("instanceRegistry.unregister", async () => {
    await unregisterInstance();
  });

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
  const wss = await initWsServer(server);
  shutdown.add("ws.close", async () => {
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {
        // Ignore.
      }
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, () => {
      logger.info({ port: config.port }, "Gateway service started");
      resolve();
    });
  });
}

export async function shutdown(): Promise<void> {
  await runningShutdown?.run();
  runningShutdown = null;
}

if (IS_DIRECT_RUN && !IS_TEST_ENV) {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Gateway service failed");
    shutdown().finally(() => process.exit(1));
  };

  process.on("uncaughtException", handleFatal);
  process.on("unhandledRejection", handleFatal);

  process.on("SIGINT", () => {
    logger.info("Shutting down gateway...");
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    logger.info("Shutting down gateway...");
    shutdown().finally(() => process.exit(0));
  });

  startServer().catch(handleFatal);
}
