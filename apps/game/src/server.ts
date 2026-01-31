import {
  closeHttpServer,
  createOtelBootstrapStep,
  createServiceBootstrapBuilder,
  isTestEnv,
  runServiceMainIfDirectRun,
} from '@specify-poker/shared';
import { getConfig } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

const service = createServiceBootstrapBuilder({ logger, serviceName: 'game' })
  // Initialize OpenTelemetry before loading instrumented modules (grpc, redis, http, etc.).
  .step(
    'otel.start',
    createOtelBootstrapStep({
      isEnabled: () => !isTestEnv(),
      start: startObservability,
      stop: stopObservability,
    }),
  )
  .step('redis.connect', async ({ onShutdown }) => {
    const { closeRedisClient, connectRedis } = await import('./storage/redisClient');
    onShutdown('redis.close', async () => {
      await closeRedisClient();
    });

    await connectRedis();
    logger.info('Connected to Redis');
  })
  .step('grpc.server.start', async ({ onShutdown }) => {
    const { createGrpcServer } = await import('./api/grpc/server');

    const config = getConfig();

    const grpcServer = createGrpcServer({ port: config.port });
    onShutdown('grpc.stop', () => {
      grpcServer.stop();
    });

    await grpcServer.start();
    logger.info({ port: config.port }, 'Game Service gRPC server started');
  })
  .step('metrics.start', async ({ onShutdown }) => {
    const { startMetricsServer } = await import('./observability/metrics');
    const metricsServer = startMetricsServer(getConfig().metricsPort);
    onShutdown('metrics.close', async () => {
      await closeHttpServer(metricsServer);
    });
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

const isDirectRun = (): boolean =>
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

runServiceMainIfDirectRun({ logger, main, shutdown, isDirectRun });
