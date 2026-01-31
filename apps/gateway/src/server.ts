import {
  closeHttpServer,
  createServiceBootstrapBuilder,
  runServiceMain,
} from '@specify-poker/shared';
import { collectDefaultMetrics } from 'prom-client';
import { getConfig } from './config';
import logger from './observability/logger';
import { initOTEL, shutdownOTEL } from './observability/otel';

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

let defaultMetricsInitialized = false;

const service = createServiceBootstrapBuilder({ logger, serviceName: 'gateway' })
  .step('otel.init', async ({ onShutdown }) => {
    // Initialize OpenTelemetry before importing instrumented modules (http/express/ws/redis/etc.).
    if (isTestEnv()) {
      return;
    }

    initOTEL();
    onShutdown('otel.shutdown', async () => {
      await shutdownOTEL();
    });
  })
  .step('gateway.start', async ({ onShutdown }) => {
    const config = getConfig();

    const [
      { default: express },
      { default: cors },
      http,
      { createRouter },
      { initWsServer },
      { closeWsPubSub },
      { closeGrpcClients },
      { registerInstance, unregisterInstance },
      { closeRedisClient },
    ] = await Promise.all([
      import('express'),
      import('cors'),
      import('http'),
      import('./http/router'),
      import('./ws/server'),
      import('./ws/pubsub'),
      import('./grpc/clients'),
      import('./storage/instanceRegistry'),
      import('./storage/redisClient'),
    ]);

    const app = express();
    const server = http.createServer(app);

    onShutdown('redis.close', async () => {
      await closeRedisClient();
    });
    onShutdown('ws.pubsub.close', async () => {
      await closeWsPubSub();
    });
    onShutdown('grpc.clients.close', () => {
      closeGrpcClients();
    });
    onShutdown('http.close', async () => {
      await closeHttpServer(server);
    });

    // Instance Registry
    await registerInstance();
    onShutdown('instanceRegistry.unregister', async () => {
      await unregisterInstance();
    });

    // Observability
    if (!defaultMetricsInitialized) {
      collectDefaultMetrics();
      defaultMetricsInitialized = true;
    }

    // Security
    app.use(
      cors({
        origin: config.corsOrigin,
        credentials: true,
      }),
    );

    // Router
    app.use(createRouter());

    // WebSocket Server
    const wss = await initWsServer(server);
    onShutdown('ws.close', async () => {
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // Ignore.
        }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    });

    await new Promise<void>((resolve) => {
      server.listen(config.port, () => {
        logger.info({ port: config.port }, 'Gateway service started');
        resolve();
      });
    });
  })
  .build({
    run: async () => {},
    onStartWhileRunning: 'throw',
  });

export async function startServer(): Promise<void> {
  await service.main();
}

export async function shutdown(): Promise<void> {
  await service.shutdown();
}

if (isDirectRun && !isTestEnv()) {
  runServiceMain({ logger, main: startServer, shutdown });
}
