import {
  closeHttpServer,
  createServiceBootstrapBuilder,
  runServiceMain,
} from '@specify-poker/shared';
import type { Server as HttpServer } from 'http';
import type { Config } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

let metricsServer: HttpServer | null = null;
let eventConsumerInstance: { stop(): Promise<void> } | null = null;
let runningConfig: Config | null = null;

const requireConfig = (): Config => {
  if (!runningConfig) {
    throw new Error('Player config is not loaded');
  }
  return runningConfig;
};

const service = createServiceBootstrapBuilder({ logger, serviceName: 'player' })
  .step('otel.start', async ({ onShutdown }) => {
    // Start OTel before importing instrumented subsystems (grpc/pg/redis/etc.).
    if (isTestEnv()) {
      return;
    }

    await startObservability();
    onShutdown('otel.shutdown', async () => {
      await stopObservability();
    });
  })
  .step('config.load', async () => {
    const { getConfig } = await import('./config');
    runningConfig = getConfig();
  })
  .step('storage.init', async ({ onShutdown }) => {
    const [{ closeRedisClient }, { default: pool }, { runMigrations }] = await Promise.all([
      import('./storage/redisClient'),
      import('./storage/db'),
      import('./storage/migrations'),
    ]);

    onShutdown('redis.close', async () => {
      await closeRedisClient();
    });
    onShutdown('db.close', async () => {
      await pool.end();
    });

    await runMigrations();
  })
  .step('grpc.server.start', async ({ onShutdown }) => {
    const config = requireConfig();
    const { startGrpcServer, stopGrpcServer } = await import('./api/grpc/server');

    onShutdown('grpc.stop', () => {
      stopGrpcServer();
    });

    await startGrpcServer(config.grpcPort);
  })
  .step('metrics.start', async ({ onShutdown }) => {
    const config = requireConfig();
    const { startMetricsServer } = await import('./observability/metrics');

    onShutdown('metrics.close', async () => {
      if (!metricsServer) {
        return;
      }
      await closeHttpServer(metricsServer);
      metricsServer = null;
    });

    metricsServer = startMetricsServer(config.metricsPort);
  })
  .step('eventConsumer.start', async ({ onShutdown }) => {
    const { EventConsumer } = await import('./services/eventConsumer');
    onShutdown('eventConsumer.stop', () => {
      const consumer = eventConsumerInstance;
      eventConsumerInstance = null;
      return consumer?.stop();
    });

    const consumer = new EventConsumer();
    eventConsumerInstance = consumer;
    await consumer.start();
  })
  .step('jobs.start', async ({ onShutdown }) => {
    const { startDeletionProcessor, stopDeletionProcessor } =
      await import('./jobs/deletionProcessor');
    onShutdown('deletionProcessor.stop', () => {
      stopDeletionProcessor();
    });

    startDeletionProcessor();
  })
  .build({
    run: async () => {
      const config = requireConfig();
      logger.info({ port: config.grpcPort }, 'Player Service is running');
    },
  });

export async function main() {
  await service.main();
}

export async function shutdown() {
  logger.info('Shutting down Player Service');
  await service.shutdown();
  runningConfig = null;
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  runServiceMain({ logger, main, shutdown });
}
