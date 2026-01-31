import {
  closeHttpServer,
  createAsyncLifecycle,
  createServiceBootstrapBuilder,
  ensureError,
} from '@specify-poker/shared';
import express from 'express';
import type { Server as HttpServer } from 'http';
import type { Config } from './config';
import { createBalanceApi } from './api/balanceApi';
import type { BalanceService } from './services/balanceService';
import { createGrpcServer } from './api/grpc/server';
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

  let httpServer: HttpServer | null = null;
  let metricsServer: HttpServer | null = null;

  const bootstrap = createServiceBootstrapBuilder({ logger, serviceName: 'balance.app' })
    .step('redis.close', ({ onShutdown }) => {
      onShutdown('redis.close', async () => {
        await closeRedisClient();
      });
    })
    .step('http.listen', ({ onShutdown }) => {
      httpServer = expressApp.listen(options.config.httpPort, () => {
        logger.info({ port: options.config.httpPort }, 'Balance HTTP server listening');
      });

      onShutdown('http.close', async () => {
        if (!httpServer) {
          return;
        }
        await closeHttpServer(httpServer);
        httpServer = null;
      });
    })
    .step('grpc.server.start', async ({ onShutdown }) => {
      const grpcServer = createGrpcServer({
        port: options.config.grpcPort,
        handlers: api.grpcHandlers,
      });

      onShutdown('grpc.stop', () => {
        grpcServer.stop();
      });

      await grpcServer.start();
    })
    .step('metrics.start', ({ onShutdown }) => {
      metricsServer = startMetricsServer(options.config.metricsPort);

      onShutdown('metrics.close', async () => {
        if (!metricsServer) {
          return;
        }
        await closeHttpServer(metricsServer);
        metricsServer = null;
      });
    })
    .step('jobs.start', ({ onShutdown }) => {
      onShutdown('jobs.stop', () => {
        stopReservationExpiryJob();
        stopLedgerVerificationJob();
      });

      startReservationExpiryJob();
      startLedgerVerificationJob();
    })
    .build({
      run: async () => undefined,
      onStartWhileRunning: 'throw',
    });

  const lifecycle = createAsyncLifecycle({
    start: async () => {
      await bootstrap.main();
    },
    stop: async () => {
      await bootstrap.shutdown();
    },
  });

  return { expressApp, start: lifecycle.start, stop: lifecycle.stop };
}
