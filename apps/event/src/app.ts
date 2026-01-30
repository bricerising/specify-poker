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
  type RunningResources = {
    shutdown: ShutdownManager;
    metricsServer: HttpServer | null;
  };

  type AppState =
    | { kind: 'stopped' }
    | { kind: 'starting'; promise: Promise<void> }
    | { kind: 'started'; resources: RunningResources }
    | { kind: 'stopping'; promise: Promise<void> };

  let state: AppState = { kind: 'stopped' };

  const startInternal = async (resources: RunningResources): Promise<void> => {
    const shutdown = resources.shutdown;

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

  const start = async (): Promise<void> => {
    while (true) {
      const current = state;
      switch (current.kind) {
        case 'started':
          return;
        case 'starting':
          await current.promise;
          return;
        case 'stopping':
          await current.promise;
          continue;
        case 'stopped': {
          const shutdown = createShutdownManager({ logger });
          const resources: RunningResources = { shutdown, metricsServer: null };

          const startPromise = (async () => {
            try {
              await startInternal(resources);
              state = { kind: 'started', resources };
            } catch (error: unknown) {
              try {
                await shutdown.run();
              } catch (shutdownError: unknown) {
                logger.error(
                  { err: shutdownError },
                  'EventApp shutdown failed after start error',
                );
              } finally {
                state = { kind: 'stopped' };
              }
              throw error;
            }
          })();

          state = { kind: 'starting', promise: startPromise };
          await startPromise;
          return;
        }
      }
    }
  };

  const stop = async (): Promise<void> => {
    while (true) {
      const current = state;
      switch (current.kind) {
        case 'stopped':
          return;
        case 'starting':
          await current.promise.catch(() => undefined);
          continue;
        case 'stopping':
          await current.promise;
          return;
        case 'started': {
          const promise = (async () => {
            try {
              await current.resources.shutdown.run();
            } finally {
              state = { kind: 'stopped' };
            }
          })();

          state = { kind: 'stopping', promise };
          await promise;
          return;
        }
      }
    }
  };

  return { start, stop };
}
