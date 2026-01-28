import { createShutdownManager, runServiceMain, type ShutdownManager } from "@specify-poker/shared";
import type { Server } from "http";
import { collectDefaultMetrics } from "prom-client";
import { getConfig } from "./config";
import logger from "./observability/logger";
import { initOTEL, shutdownOTEL } from "./observability/otel";

const isDirectRun =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

const isTestEnv = process.env.NODE_ENV === "test";

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

  // Initialize OpenTelemetry before importing instrumented modules (http/express/ws/redis/etc.).
  if (!isTestEnv) {
    initOTEL();
  }

  const [
    { default: express },
    { default: cors },
    http,
    { createRouter },
    { initWsServer },
    { closeWsPubSub },
    { registerInstance, unregisterInstance },
    { closeRedisClient },
  ] = await Promise.all([
    import("express"),
    import("cors"),
    import("http"),
    import("./http/router"),
    import("./ws/server"),
    import("./ws/pubsub"),
    import("./storage/instanceRegistry"),
    import("./storage/redisClient"),
  ]);

  const app = express();
  const server = http.createServer(app);

  const shutdown = createShutdownManager({ logger });
  runningShutdown = shutdown;
  shutdown.add("otel.shutdown", async () => {
    if (!isTestEnv) {
      await shutdownOTEL();
    }
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
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );

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

if (isDirectRun && !isTestEnv) {
  runServiceMain({ logger, main: startServer, shutdown });
}
