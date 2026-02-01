import type { Server as HttpServer } from 'http';
import type { WebSocketServer } from 'ws';

type RequestListenerLike = (req: unknown, res: unknown) => void;

export type ExpressAppLike = RequestListenerLike & {
  use: (...handlers: unknown[]) => unknown;
  set: (setting: string, value: unknown) => unknown;
};

export type GatewayRuntimeDeps = {
  createExpressApp(): ExpressAppLike;
  createCorsMiddleware(options: { origin: string; credentials: boolean }): unknown;
  createHttpServer(app: ExpressAppLike): HttpServer;
  createRouter(): unknown;
  initWsServer(server: HttpServer): Promise<WebSocketServer>;
  closeWsPubSub(): Promise<void>;
  closeGrpcClients(): void;
  registerInstance(): Promise<void>;
  unregisterInstance(): Promise<void>;
  closeRedisClient(): Promise<void>;
};

/**
 * Abstract Factory: loads and wires a compatible set of runtime dependencies for the Gateway app.
 *
 * Keeping this as an async factory (instead of top-level imports) preserves the boot ordering:
 * OTel initializes before we load instrumented modules like express/http/ws/redis/grpc.
 */
export async function loadGatewayRuntimeDeps(): Promise<GatewayRuntimeDeps> {
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

  return {
    createExpressApp: () => express() as unknown as ExpressAppLike,
    createCorsMiddleware: (options) => cors(options),
    createHttpServer: (app) => http.createServer(app),
    createRouter,
    initWsServer,
    closeWsPubSub,
    closeGrpcClients,
    registerInstance,
    unregisterInstance,
    closeRedisClient,
  };
}
