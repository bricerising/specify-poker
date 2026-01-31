import { closeHttpServer, createAsyncLifecycle, createShutdownManager } from '@specify-poker/shared';
import { collectDefaultMetrics } from 'prom-client';
import type { Server as HttpServer } from 'http';
import type { WebSocketServer } from 'ws';
import type { Config } from './config';
import logger from './observability/logger';

export type GatewayApp = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type CreateGatewayAppOptions = {
  config: Config;
};

let defaultMetricsInitialized = false;

export function createGatewayApp(options: CreateGatewayAppOptions): GatewayApp {
  type RunningResources = {
    shutdown: ReturnType<typeof createShutdownManager>;
    httpServer: HttpServer | null;
    wsServer: WebSocketServer | null;
  };

  let resources: RunningResources | null = null;

  const stopInternal = async (): Promise<void> => {
    if (!resources) {
      return;
    }

    const current = resources;
    resources = null;
    await current.shutdown.run();
  };

  const startInternal = async (): Promise<void> => {
    const shutdown = createShutdownManager({ logger });
    const started: RunningResources = { shutdown, httpServer: null, wsServer: null };

    try {
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

      shutdown.add('redis.close', async () => {
        await closeRedisClient();
      });
      shutdown.add('ws.pubsub.close', async () => {
        await closeWsPubSub();
      });
      shutdown.add('grpc.clients.close', () => {
        closeGrpcClients();
      });

      shutdown.add('http.close', async () => {
        if (!started.httpServer) {
          return;
        }
        await closeHttpServer(started.httpServer);
        started.httpServer = null;
      });

      const app = express();
      const server = http.createServer(app);
      started.httpServer = server;

      // Instance Registry
      await registerInstance();
      shutdown.add('instanceRegistry.unregister', async () => {
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
          origin: options.config.corsOrigin,
          credentials: true,
        }),
      );

      // Router
      app.use(createRouter());

      // WebSocket Server
      started.wsServer = await initWsServer(server);
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
