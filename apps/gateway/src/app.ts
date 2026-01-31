import { closeHttpServer, createAsyncLifecycle, createShutdownManager } from '@specify-poker/shared';
import { collectDefaultMetrics } from 'prom-client';
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
  type RunningResources = {
    shutdown: ReturnType<typeof createShutdownManager>;
    httpServer: HttpServer | null;
    wsServer: WebSocketServer | null;
  };

  let resources: RunningResources | null = null;

  const initDefaultMetrics = (): void => {
    if (defaultMetricsInitialized) {
      return;
    }

    collectDefaultMetrics();
    defaultMetricsInitialized = true;
  };

  const stopInternal = async (): Promise<void> => {
    if (!resources) {
      return;
    }

    const current = resources;
    resources = null;
    await current.shutdown.run();
  };

  const startGatewayRuntime = async (
    deps: GatewayRuntimeDeps,
    started: RunningResources,
  ): Promise<void> => {
    const shutdown = started.shutdown;

    shutdown.add('redis.close', async () => {
      await deps.closeRedisClient();
    });
    shutdown.add('ws.pubsub.close', async () => {
      await deps.closeWsPubSub();
    });
    shutdown.add('grpc.clients.close', () => {
      deps.closeGrpcClients();
    });

    shutdown.add('http.close', async () => {
      if (!started.httpServer) {
        return;
      }
      await closeHttpServer(started.httpServer);
      started.httpServer = null;
    });

    const app = deps.createExpressApp();
    const server = deps.createHttpServer(app);
    started.httpServer = server;

    // Instance Registry
    await deps.registerInstance();
    shutdown.add('instanceRegistry.unregister', async () => {
      await deps.unregisterInstance();
    });

    // Observability
    initDefaultMetrics();

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
    started.wsServer = await deps.initWsServer(server);
    shutdown.add('ws.close', async () => {
      const wss = started.wsServer;
      if (!wss) {
        return;
      }
      started.wsServer = null;

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

  const startInternal = async (): Promise<void> => {
    const shutdown = createShutdownManager({ logger });
    const started: RunningResources = { shutdown, httpServer: null, wsServer: null };

    try {
      const deps = options.deps ?? (await loadGatewayRuntimeDeps());
      await startGatewayRuntime(deps, started);
      resources = started;
    } catch (error: unknown) {
      try {
        await shutdown.run();
      } finally {
        resources = null;
      }
      throw error;
    }
  };

  const lifecycle = createAsyncLifecycle({ start: startInternal, stop: stopInternal });

  return { start: lifecycle.start, stop: lifecycle.stop };
}
