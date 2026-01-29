import {
  closeHttpServer,
  createShutdownManager,
  runServiceMain,
  type ShutdownManager,
} from '@specify-poker/shared';
import type { Server as HttpServer } from 'http';
import { config } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

let metricsServer: HttpServer | null = null;
let runningShutdown: ShutdownManager | null = null;

export async function main() {
  const isTestEnv = process.env.NODE_ENV === 'test';

  // Initialize OpenTelemetry before loading instrumented modules (grpc, redis, http, etc.).
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
    const { closeRedisClient, connectRedis } = await import('./storage/redisClient');
    shutdownManager.add('redis.close', async () => {
      await closeRedisClient();
    });

    await connectRedis();
    logger.info('Connected to Redis');

    const { startGrpcServer, stopGrpcServer } = await import('./api/grpc/server');
    shutdownManager.add('grpc.stop', () => {
      stopGrpcServer();
    });

    await startGrpcServer(config.port);
    logger.info({ port: config.port }, 'Game Service gRPC server started');

    const { startMetricsServer } = await import('./observability/metrics');
    shutdownManager.add('metrics.close', async () => {
      if (!metricsServer) {
        return;
      }
      await closeHttpServer(metricsServer);
      metricsServer = null;
    });

    metricsServer = startMetricsServer(config.metricsPort);

    const { closeGrpcClients } = await import('./api/grpc/clients');
    shutdownManager.add('grpc.clients.close', () => {
      closeGrpcClients();
    });

    const { tableService } = await import('./services/tableService');
    shutdownManager.add('tableService.shutdown', () => {
      tableService.shutdown();
    });

    logger.info('Game Service is running');
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to start Game Service');
    await shutdownManager.run();
    runningShutdown = null;
    throw err;
  }
}

export async function shutdown() {
  logger.info('Shutting down Game Service');
  await runningShutdown?.run();
  runningShutdown = null;
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  runServiceMain({ logger, main, shutdown });
}
