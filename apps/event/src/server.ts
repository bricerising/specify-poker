import { config } from "./config";
import { startObservability, stopObservability } from "./observability";
import logger from "./observability/logger";
import type { Server as HttpServer } from "http";

type ShutdownAction = () => void | Promise<void>;

let runningShutdown: (() => Promise<void>) | null = null;
let isShuttingDown = false;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

async function runShutdownActions(actions: ReadonlyArray<ShutdownAction>): Promise<void> {
  for (const action of [...actions].reverse()) {
    try {
      await action();
    } catch (error) {
      logger.error({ err: error }, "Shutdown step failed");
    }
  }
}

function closeHttpServer(server: HttpServer): Promise<void> {
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

export async function main() {
  const isTest = isTestEnv();
  const shutdownActions: ShutdownAction[] = [];

  try {
    if (runningShutdown) {
      logger.warn("Event Service is already running; restarting");
      await shutdown();
    }

    if (!isTest) {
      // Start OTel before importing instrumented subsystems (pg, redis, grpc, etc.)
      await startObservability();
      shutdownActions.push(async () => {
        await stopObservability();
      });
    }

    const { closePgPool } = await import("./storage/pgClient");
    shutdownActions.push(async () => {
      await closePgPool();
    });

    const { runMigrations } = await import("./storage/migrations");
    const { connectRedis, closeRedis } = await import("./storage/redisClient");
    const { handMaterializer } = await import("./jobs/handMaterializer");
    const { archiver } = await import("./jobs/archiver");
    const { startMetricsServer } = await import("./observability/metrics");
    const { startGrpcServer, stopGrpcServer } = await import("./api/grpc/server");

    // Run DB migrations
    if (!isTest) {
      await runMigrations();
    }

    // Connect to Redis
    await connectRedis();
    shutdownActions.push(async () => {
      await closeRedis();
    });

    // Start background jobs
    if (!isTest) {
      await handMaterializer.start();
      await archiver.start();
      shutdownActions.push(() => {
        handMaterializer.stop();
        archiver.stop();
      });
    }

    // Start metrics server
    let metricsServer: HttpServer | null = null;
    if (!isTest) {
      metricsServer = startMetricsServer(config.metricsPort);
      shutdownActions.push(async () => {
        if (!metricsServer) {
          return;
        }
        await closeHttpServer(metricsServer);
        metricsServer = null;
      });
    }

    // Start gRPC server
    await startGrpcServer(config.grpcPort);
    shutdownActions.push(() => {
      stopGrpcServer();
    });

    logger.info({ port: config.grpcPort }, "Event Service is running");

    runningShutdown = async () => {
      await runShutdownActions(shutdownActions);
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to start Event Service");
    await runShutdownActions(shutdownActions);
    throw error;
  }
}

export async function shutdown(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  const shutdownFn = runningShutdown;
  runningShutdown = null;

  try {
    await shutdownFn?.();
  } finally {
    isShuttingDown = false;
  }
}

const isDirectRun =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

if (isDirectRun && !isTestEnv()) {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Event Service failed");
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
