import {
  closeHttpServer,
  createAsyncLifecycle,
  createServiceBootstrapBuilder,
  startPrometheusMetricsServer,
  type ShutdownAction,
} from '@specify-poker/shared';
import { collectDefaultMetrics, register } from 'prom-client';
import type { Server as HttpServer } from 'http';
import type { WebSocketServer } from 'ws';
import type { Config } from './config';
import logger from './observability/logger';
import type { GatewayRuntimeDeps } from './appDeps';
import { loadGatewayRuntimeDeps } from './appDeps';

export type GatewayApp = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type CreateGatewayAppOptions = {
  config: Config;
  deps?: GatewayRuntimeDeps;
};

let defaultMetricsInitialized = false;

export function createGatewayApp(options: CreateGatewayAppOptions): GatewayApp {
  const initDefaultMetrics = (): void => {
    if (defaultMetricsInitialized) {
      return;
    }

    collectDefaultMetrics();
    defaultMetricsInitialized = true;
  };

  let httpServer: HttpServer | null = null;
  let wsServer: WebSocketServer | null = null;
  let metricsServer: HttpServer | null = null;

  type OnShutdown = (name: string, action: ShutdownAction) => void;

  const startGatewayRuntime = async (
    deps: GatewayRuntimeDeps,
    onShutdown: OnShutdown,
  ): Promise<void> => {
    onShutdown('redis.close', async () => {
      await deps.closeRedisClient();
    });
    onShutdown('ws.pubsub.close', async () => {
      await deps.closeWsPubSub();
    });
    onShutdown('grpc.clients.close', () => {
      deps.closeGrpcClients();
    });

    onShutdown('http.close', async () => {
      if (!httpServer) {
        return;
      }
      await closeHttpServer(httpServer);
      httpServer = null;
    });

    onShutdown('metrics.close', async () => {
      if (!metricsServer) {
        return;
      }
      await closeHttpServer(metricsServer);
      metricsServer = null;
    });

    const app = deps.createExpressApp();
    if (options.config.trustProxyHops > 0) {
      app.set('trust proxy', options.config.trustProxyHops);
    }
    const server = deps.createHttpServer(app);
    httpServer = server;

    // Instance Registry
    await deps.registerInstance();
    onShutdown('instanceRegistry.unregister', async () => {
      await deps.unregisterInstance();
    });

    // Observability
    initDefaultMetrics();
    metricsServer = startPrometheusMetricsServer({
      port: options.config.metricsPort,
      registry: register,
      logger,
      logMessage: 'Gateway metrics server listening',
    });

    // Security
    app.use(
      deps.createCorsMiddleware({
        origin: options.config.corsOrigin,
        credentials: true,
      }),
    );

    // Router
    app.use(deps.createRouter());

    // WebSocket Server
    wsServer = await deps.initWsServer(server);
    onShutdown('ws.close', async () => {
      const wss = wsServer;
      if (!wss) {
        return;
      }
      wsServer = null;

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
      server.listen(options.config.port, () => {
        logger.info({ port: options.config.port }, 'Gateway service started');
        resolve();
      });
    });
  };

  const bootstrap = createServiceBootstrapBuilder({ logger, serviceName: 'gateway.app' })
    .stepWithState('deps.load', async () => {
      const deps = options.deps ?? (await loadGatewayRuntimeDeps());
      return { deps };
    })
    .step('gateway.start', async ({ state, onShutdown }) => {
      await startGatewayRuntime(state.deps, onShutdown);
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
