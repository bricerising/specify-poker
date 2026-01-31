import {
  closeHttpServer,
  createOtelBootstrapStep,
  createServiceBootstrapBuilder,
  runServiceMain,
} from '@specify-poker/shared';
import type { Config } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

type PlayerServiceState = {
  config: Config;
};

const service = createServiceBootstrapBuilder({ logger, serviceName: 'player' })
  // Start OTel before importing instrumented subsystems (grpc/pg/redis/etc.).
  .step(
    'otel.start',
    createOtelBootstrapStep({
      isEnabled: () => !isTestEnv(),
      start: startObservability,
      stop: stopObservability,
    }),
  )
  .stepWithState('config.load', async (): Promise<PlayerServiceState> => {
    const { getConfig } = await import('./config');
    return { config: getConfig() };
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
  .step('grpc.server.start', async ({ onShutdown, state }) => {
    const { startGrpcServer, stopGrpcServer } = await import('./api/grpc/server');

    onShutdown('grpc.stop', () => {
      stopGrpcServer();
    });

    await startGrpcServer(state.config.grpcPort);
  })
  .step('metrics.start', async ({ onShutdown, state }) => {
    const { startMetricsServer } = await import('./observability/metrics');

    const metricsServer = startMetricsServer(state.config.metricsPort);
    onShutdown('metrics.close', async () => {
      await closeHttpServer(metricsServer);
    });
  })
  .step('eventConsumer.start', async ({ onShutdown }) => {
    const { EventConsumer } = await import('./services/eventConsumer');
    const consumer = new EventConsumer();
    onShutdown('eventConsumer.stop', async () => {
      await consumer.stop();
    });
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
    run: async ({ state }) => {
      logger.info({ port: state.config.grpcPort }, 'Player Service is running');
    },
  });

export async function main() {
  await service.main();
}

export async function shutdown() {
  logger.info('Shutting down Player Service');
  await service.shutdown();
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  runServiceMain({ logger, main, shutdown });
}
