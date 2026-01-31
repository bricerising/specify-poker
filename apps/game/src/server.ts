import {
  closeHttpServer,
  createServiceBootstrapBuilder,
  runServiceMain,
} from '@specify-poker/shared';
import type { Server as HttpServer } from 'http';
import { getConfig } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

let metricsServer: HttpServer | null = null;
const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

const service = createServiceBootstrapBuilder({ logger, serviceName: 'game' })
  .step('otel.start', async ({ onShutdown }) => {
    // Initialize OpenTelemetry before loading instrumented modules (grpc, redis, http, etc.).
    if (isTestEnv()) {
      return;
    }

    await startObservability();
    onShutdown('otel.shutdown', async () => {
      await stopObservability();
    });
  })
  .step('redis.connect', async ({ onShutdown }) => {
    const { closeRedisClient, connectRedis } = await import('./storage/redisClient');
    onShutdown('redis.close', async () => {
      await closeRedisClient();
    });

    await connectRedis();
    logger.info('Connected to Redis');
  })
  .step('grpc.server.start', async ({ onShutdown }) => {
    const { startGrpcServer, stopGrpcServer } = await import('./api/grpc/server');
    onShutdown('grpc.stop', () => {
      stopGrpcServer();
    });

    const config = getConfig();
    await startGrpcServer(config.port);
    logger.info({ port: config.port }, 'Game Service gRPC server started');
  })
  .step('metrics.start', async ({ onShutdown }) => {
    const { startMetricsServer } = await import('./observability/metrics');
    onShutdown('metrics.close', async () => {
      if (!metricsServer) {
        return;
      }
      await closeHttpServer(metricsServer);
      metricsServer = null;
    });

    metricsServer = startMetricsServer(getConfig().metricsPort);
  })
  .step('grpc.clients.close', async ({ onShutdown }) => {
    const { closeGrpcClients } = await import('./api/grpc/clients');
    onShutdown('grpc.clients.close', () => {
      closeGrpcClients();
    });
  })
  .step('tableService.shutdown', async ({ onShutdown }) => {
    const { tableService } = await import('./services/tableService');
    onShutdown('tableService.shutdown', () => {
      tableService.shutdown();
    });
  })
  .build({
    run: async () => {
      logger.info('Game Service is running');
    },
  });

export async function main() {
  await service.main();
}

export async function shutdown() {
  logger.info('Shutting down Game Service');
  await service.shutdown();
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  runServiceMain({ logger, main, shutdown });
}
