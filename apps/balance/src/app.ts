import { createShutdownManager, type ShutdownManager } from "@specify-poker/shared";
import express from "express";
import type { Server as HttpServer } from "http";
import type { Config } from "./config";
import router from "./api/http/router";
import { startGrpcServer, stopGrpcServer } from "./api/grpc/server";
import { startReservationExpiryJob, stopReservationExpiryJob } from "./jobs/reservationExpiry";
import { startLedgerVerificationJob, stopLedgerVerificationJob } from "./jobs/ledgerVerification";
import { recordHttpRequest, startMetricsServer } from "./observability/metrics";
import logger from "./observability/logger";
import { closeRedisClient } from "./storage/redisClient";

export type BalanceApp = {
  expressApp: express.Express;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type CreateBalanceAppOptions = {
  config: Config;
  stopObservability?: () => Promise<void>;
};

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

function createBalanceExpressApp(): express.Express {
  const app = express();

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

  app.use(router);

  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err, path: req.path }, "Unhandled error");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  });

  return app;
}

export function createBalanceApp(options: CreateBalanceAppOptions): BalanceApp {
  const expressApp = createBalanceExpressApp();

  let httpServer: HttpServer | null = null;
  let metricsServer: HttpServer | null = null;
  let shutdownManager: ShutdownManager | null = null;
  let isStarted = false;
  let startPromise: Promise<void> | null = null;

  const stop = async (): Promise<void> => {
    const shutdown = shutdownManager;
    if (!shutdown) {
      isStarted = false;
      startPromise = null;
      httpServer = null;
      metricsServer = null;
      return;
    }

    try {
      await shutdown.run();
    } finally {
      shutdownManager = null;
      isStarted = false;
      startPromise = null;
      httpServer = null;
      metricsServer = null;
    }
  };

  const start = async (): Promise<void> => {
    if (isStarted) {
      return;
    }
    if (startPromise) {
      return startPromise;
    }

    startPromise = (async () => {
      const shutdown = createShutdownManager({ logger });
      shutdownManager = shutdown;

      if (options.stopObservability) {
        shutdown.add("otel.shutdown", async () => {
          await options.stopObservability?.();
        });
      }
      shutdown.add("redis.close", async () => {
        await closeRedisClient();
      });
      shutdown.add("metrics.close", async () => {
        if (!metricsServer) {
          return;
        }
        await closeHttpServer(metricsServer);
        metricsServer = null;
      });
      shutdown.add("http.close", async () => {
        if (!httpServer) {
          return;
        }
        await closeHttpServer(httpServer);
        httpServer = null;
      });
      shutdown.add("grpc.stop", () => {
        stopGrpcServer();
      });
      shutdown.add("jobs.stop", () => {
        stopReservationExpiryJob();
        stopLedgerVerificationJob();
      });

      try {
        httpServer = expressApp.listen(options.config.httpPort, () => {
          logger.info({ port: options.config.httpPort }, "Balance HTTP server listening");
        });

        await startGrpcServer(options.config.grpcPort);

        metricsServer = startMetricsServer(options.config.metricsPort);

        startReservationExpiryJob();
        startLedgerVerificationJob();

        isStarted = true;
        logger.info("Balance service started successfully");
      } catch (error: unknown) {
        logger.error({ err: error }, "Failed to start balance service");
        await stop();
        throw error;
      } finally {
        startPromise = null;
      }
    })();

    return startPromise;
  };

  return { expressApp, start, stop };
}

