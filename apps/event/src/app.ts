import {
  closeHttpServer,
  createShutdownManager,
  type ShutdownManager,
} from '@specify-poker/shared';
import type { Server as HttpServer } from 'http';
import type { Config } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

export type EventApp = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type CreateEventAppOptions = {
  config: Config;
  isTest: boolean;
};

export function createEventApp(options: CreateEventAppOptions): EventApp {
  let shutdownManager: ShutdownManager | null = null;
  let metricsServer: HttpServer | null = null;
  let isStarted = false;
  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;

  const stop = async (): Promise<void> => {
    if (stopPromise) {
      await stopPromise;
      return;
    }

    const shutdown = shutdownManager;
    if (!shutdown) {
      isStarted = false;
      startPromise = null;
      metricsServer = null;
      return;
    }

    stopPromise = (async () => {
      try {
        await shutdown.run();
      } finally {
        shutdownManager = null;
        metricsServer = null;
        isStarted = false;
        startPromise = null;
        stopPromise = null;
      }
    })();

    await stopPromise;
  };

  const start = async (): Promise<void> => {
    if (stopPromise) {
      await stopPromise;
    }
    if (isStarted) {
      return;
    }
    if (startPromise) {
      return startPromise;
    }

    startPromise = (async () => {
      const shutdown = createShutdownManager({ logger });
      shutdownManager = shutdown;

      try {
        if (!options.isTest) {
          // Start OTel before importing instrumented subsystems (pg, redis, grpc, etc.)
          await startObservability();
          shutdown.add('otel.shutdown', async () => {
            await stopObservability();
          });
        }

        const { closePgPool } = await import('./storage/pgClient');
        shutdown.add('pg.close', async () => {
          await closePgPool();
        });

        const { runMigrations } = await import('./storage/migrations');
        const { connectRedis, closeRedis } = await import('./storage/redisClient');
        const { handMaterializer } = await import('./jobs/handMaterializer');
        const { archiver } = await import('./jobs/archiver');
        const { startMetricsServer } = await import('./observability/metrics');
        const { startGrpcServer, stopGrpcServer } = await import('./api/grpc/server');

        if (!options.isTest) {
          await runMigrations();
        }

        await connectRedis();
        shutdown.add('redis.close', async () => {
          await closeRedis();
        });

        if (!options.isTest) {
          await handMaterializer.start();
          await archiver.start();
          shutdown.add('jobs.stop', async () => {
            await handMaterializer.stop();
            archiver.stop();
          });

          metricsServer = startMetricsServer(options.config.metricsPort);
          shutdown.add('metrics.close', async () => {
            if (!metricsServer) {
              return;
            }
            await closeHttpServer(metricsServer);
            metricsServer = null;
          });
        }

        await startGrpcServer(options.config.grpcPort);
        shutdown.add('grpc.stop', () => {
          stopGrpcServer();
        });

        isStarted = true;
      } catch (error: unknown) {
        try {
          await shutdown.run();
        } catch (shutdownError: unknown) {
          logger.error({ err: shutdownError }, 'EventApp shutdown failed after start error');
        } finally {
          shutdownManager = null;
          metricsServer = null;
          isStarted = false;
        }
        throw error;
      } finally {
        startPromise = null;
      }
    })();

    return startPromise;
  };

  return { start, stop };
}
