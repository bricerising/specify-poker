import {
  closeHttpServer,
  createShutdownManager,
  runServiceMain,
  type ShutdownManager,
} from '@specify-poker/shared';
import type { Server as HttpServer } from 'http';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

let metricsServer: HttpServer | null = null;
let eventConsumerInstance: { stop(): Promise<void> } | null = null;
let runningShutdown: ShutdownManager | null = null;

export async function main() {
  const isTestEnv = process.env.NODE_ENV === 'test';

  // Start OTel before importing instrumented subsystems (grpc/pg/redis/etc.).
  if (!isTestEnv) {
    startObservability();
  }

  const shutdownManager = createShutdownManager({ logger });
  runningShutdown = shutdownManager;
  shutdownManager.add('otel.shutdown', async () => {
    if (!isTestEnv) {
      await stopObservability();
    }
  });

  try {
    const [{ getConfig }, { closeRedisClient }] = await Promise.all([
      import('./config'),
      import('./storage/redisClient'),
    ]);

    const config = getConfig();

    shutdownManager.add('redis.close', async () => {
      await closeRedisClient();
    });

    const { default: pool } = await import('./storage/db');
    shutdownManager.add('db.close', async () => {
      await pool.end();
    });

    const { startGrpcServer, stopGrpcServer } = await import('./api/grpc/server');
    shutdownManager.add('grpc.stop', () => {
      stopGrpcServer();
    });

    const { startMetricsServer } = await import('./observability/metrics');
    shutdownManager.add('metrics.close', async () => {
      if (!metricsServer) {
        return;
      }
      await closeHttpServer(metricsServer);
      metricsServer = null;
    });

    const { EventConsumer } = await import('./services/eventConsumer');
    shutdownManager.add('eventConsumer.stop', () => {
      const consumer = eventConsumerInstance;
      eventConsumerInstance = null;
      return consumer?.stop();
    });

    const { startDeletionProcessor, stopDeletionProcessor } =
      await import('./jobs/deletionProcessor');
    shutdownManager.add('deletionProcessor.stop', () => {
      stopDeletionProcessor();
    });

    const { runMigrations } = await import('./storage/migrations');

    await runMigrations();
    await startGrpcServer(config.grpcPort);
    metricsServer = startMetricsServer(config.metricsPort);

    const consumer = new EventConsumer();
    eventConsumerInstance = consumer;
    await consumer.start();

    // Start background jobs
    startDeletionProcessor();

    logger.info({ port: config.grpcPort }, 'Player Service is running');
  } catch (error: unknown) {
    logger.error({ err: error }, 'Failed to start Player Service');
    await shutdownManager.run();
    runningShutdown = null;
    throw error;
  }
}

export async function shutdown() {
  logger.info('Shutting down Player Service');
  await runningShutdown?.run();
  runningShutdown = null;
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  runServiceMain({ logger, main, shutdown });
}
