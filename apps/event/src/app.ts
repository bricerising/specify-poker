import {
  closeHttpServer,
  createAsyncLifecycle,
  createServiceBootstrapBuilder,
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
  let metricsServer: HttpServer | null = null;

  const bootstrap = createServiceBootstrapBuilder({ logger, serviceName: 'event.app' })
    .step('pg.close', async ({ onShutdown }) => {
      const { closePgPool } = await import('./storage/pgClient');
      onShutdown('pg.close', async () => {
        await closePgPool();
      });
    })
    .step('migrations.run', async () => {
      if (options.isTest) {
        return;
      }

      const { runMigrations } = await import('./storage/migrations');
      await runMigrations();
    })
    .step('redis.connect', async ({ onShutdown }) => {
      const { connectRedis, closeRedis } = await import('./storage/redisClient');

      await connectRedis();
      onShutdown('redis.close', async () => {
        await closeRedis();
      });
    })
    .step('jobs.start', async ({ onShutdown }) => {
      if (options.isTest) {
        return;
      }

      const { handMaterializer } = await import('./jobs/handMaterializer');
      const { archiver } = await import('./jobs/archiver');

      await handMaterializer.start();
      await archiver.start();

      onShutdown('jobs.stop', async () => {
        await handMaterializer.stop();
        archiver.stop();
      });
    })
    .step('metrics.start', async ({ onShutdown }) => {
      if (options.isTest) {
        return;
      }

      const { startMetricsServer } = await import('./observability/metrics');

      metricsServer = startMetricsServer(options.config.metricsPort);
      onShutdown('metrics.close', async () => {
        if (!metricsServer) {
          return;
        }
        await closeHttpServer(metricsServer);
        metricsServer = null;
      });
    })
    .step('grpc.server.start', async ({ onShutdown }) => {
      const { createGrpcServer } = await import('./api/grpc/server');

      const grpcServer = createGrpcServer({ port: options.config.grpcPort });
      onShutdown('grpc.stop', () => {
        grpcServer.stop();
      });

      await grpcServer.start();
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

  return { start: lifecycle.start, stop: lifecycle.stop };
}
