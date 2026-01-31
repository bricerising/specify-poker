import {
  closeHttpServer,
  createAsyncLifecycle,
  createShutdownManager,
  ensureError,
  type ShutdownManager,
} from '@specify-poker/shared';
import express from 'express';
import type { Server as HttpServer } from 'http';
import type { Config } from './config';
import { createBalanceApi } from './api/balanceApi';
import type { BalanceService } from './services/balanceService';
import { startGrpcServer, stopGrpcServer } from './api/grpc/server';
import { startReservationExpiryJob, stopReservationExpiryJob } from './jobs/reservationExpiry';
import { startLedgerVerificationJob, stopLedgerVerificationJob } from './jobs/ledgerVerification';
import { recordHttpRequest, startMetricsServer } from './observability/metrics';
import logger from './observability/logger';
import { closeRedisClient } from './storage/redisClient';

export type BalanceApp = {
  expressApp: express.Express;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type CreateBalanceAppOptions = {
  config: Config;
  service?: BalanceService;
};

function createBalanceExpressApp(httpRouter: express.Router): express.Express {
  const app = express();

  app.use(express.json());
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const route = req.route?.path
        ? `${req.baseUrl}${req.route.path}`
        : req.originalUrl.split('?')[0];
      recordHttpRequest(req.method, route, res.statusCode, Date.now() - startedAt);
    });
    next();
  });

  app.use(httpRouter);

  app.use(
    (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const error = ensureError(err);
      logger.error({ err: error, path: req.path }, 'Unhandled error');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    },
  );

  return app;
}

export function createBalanceApp(options: CreateBalanceAppOptions): BalanceApp {
  const api = createBalanceApi(options.service);
  const expressApp = createBalanceExpressApp(api.httpRouter);

  type RunningResources = {
    shutdown: ShutdownManager;
    httpServer: HttpServer | null;
    metricsServer: HttpServer | null;
  };

  let resources: RunningResources | null = null;

  const stopInternal = async (): Promise<void> => {
    if (!resources) {
      return;
    }

    const current = resources;
    resources = null;
    await current.shutdown.run();
  };

  const startInternal = async (): Promise<void> => {
    const shutdown = createShutdownManager({ logger });
    const started: RunningResources = { shutdown, httpServer: null, metricsServer: null };

    shutdown.add('redis.close', async () => {
      await closeRedisClient();
    });
    shutdown.add('metrics.close', async () => {
      if (!started.metricsServer) {
        return;
      }
      await closeHttpServer(started.metricsServer);
      started.metricsServer = null;
    });
    shutdown.add('http.close', async () => {
      if (!started.httpServer) {
        return;
      }
      await closeHttpServer(started.httpServer);
      started.httpServer = null;
    });
    shutdown.add('grpc.stop', () => {
      stopGrpcServer();
    });
    shutdown.add('jobs.stop', () => {
      stopReservationExpiryJob();
      stopLedgerVerificationJob();
    });

    try {
      started.httpServer = expressApp.listen(options.config.httpPort, () => {
        logger.info({ port: options.config.httpPort }, 'Balance HTTP server listening');
      });

      await startGrpcServer(options.config.grpcPort, api.grpcHandlers);

      started.metricsServer = startMetricsServer(options.config.metricsPort);

      startReservationExpiryJob();
      startLedgerVerificationJob();

      resources = started;
    } catch (error: unknown) {
      try {
        await shutdown.run();
      } finally {
        resources = null;
      }
      throw error;
    }
  };

  const lifecycle = createAsyncLifecycle({ start: startInternal, stop: stopInternal });

  return { expressApp, start: lifecycle.start, stop: lifecycle.stop };
}
