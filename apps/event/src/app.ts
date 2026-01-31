import {
  closeHttpServer,
  createAsyncLifecycle,
  createShutdownManager,
  type ShutdownManager,
} from '@specify-poker/shared';
import type { Server as HttpServer } from 'http';
import type { Config } from './config';
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
  type RunningResources = {
    shutdown: ShutdownManager;
    metricsServer: HttpServer | null;
  };

  let resources: RunningResources | null = null;

  const startInternal = async (resources: RunningResources): Promise<void> => {
    const shutdown = resources.shutdown;

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

      resources.metricsServer = startMetricsServer(options.config.metricsPort);
      shutdown.add('metrics.close', async () => {
        if (!resources.metricsServer) {
          return;
        }
        await closeHttpServer(resources.metricsServer);
        resources.metricsServer = null;
      });
    }

    await startGrpcServer(options.config.grpcPort);
    shutdown.add('grpc.stop', () => {
      stopGrpcServer();
    });
  };

  const lifecycle = createAsyncLifecycle({
    start: async () => {
      const shutdown = createShutdownManager({ logger });
      const startedResources: RunningResources = { shutdown, metricsServer: null };

      try {
        await startInternal(startedResources);
        resources = startedResources;
      } catch (error: unknown) {
        try {
          await shutdown.run();
        } catch (shutdownError: unknown) {
          logger.error({ err: shutdownError }, 'EventApp shutdown failed after start error');
        } finally {
          resources = null;
        }

        throw error;
      }
    },
    stop: async () => {
      if (!resources) {
        return;
      }

      const current = resources;
      try {
        await current.shutdown.run();
      } finally {
        resources = null;
      }
    },
  });

  return { start: () => lifecycle.start(), stop: () => lifecycle.stop() };
}
