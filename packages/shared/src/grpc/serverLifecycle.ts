export type GrpcServerLifecycle = {
  start(): Promise<void>;
  stop(): void;
};

type GrpcServerLike = {
  addService(service: unknown, implementation: unknown): void;
  bindAsync(
    address: string,
    credentials: unknown,
    callback: (error: Error | null, port: number) => void,
  ): void;
  forceShutdown(): void;
  start?: () => void;
};

type GrpcModuleLike = {
  Server: new () => GrpcServerLike;
  ServerCredentials: { createInsecure: () => unknown };
  loadPackageDefinition(packageDefinition: unknown): unknown;
};

type ProtoLoaderModuleLike = {
  loadSync(filename: string | string[], options?: unknown): unknown;
};

type LoggerLike = {
  info?: (obj: Record<string, unknown>, msg: string) => void;
};

type CreateGrpcServerLifecycleOptions<TProto> = {
  grpc: GrpcModuleLike;
  protoLoader: ProtoLoaderModuleLike;
  protoPath: string | string[];
  protoLoaderOptions: unknown;
  port: number;
  host?: string;
  loadProto?: (loaded: unknown) => TProto;
  register: (server: GrpcServerLike, proto: TProto) => void;
  logger?: LoggerLike;
  logMessage?: string;
  startAfterBind?: boolean;
};

/**
 * A small facade around `@grpc/grpc-js` server setup:
 * - loads protos
 * - registers services
 * - binds and optionally starts
 * - exposes a stable start/stop lifecycle
 */
export function createGrpcServerLifecycle<TProto>(options: CreateGrpcServerLifecycleOptions<TProto>): GrpcServerLifecycle {
  const host = options.host ?? "0.0.0.0";
  const startAfterBind = options.startAfterBind ?? true;
  const loadProto = options.loadProto ?? ((loaded: unknown) => loaded as TProto);

  let server: GrpcServerLike | null = null;
  let startPromise: Promise<void> | null = null;
  let generation = 0;

  const start = async (): Promise<void> => {
    if (server) {
      return;
    }
    if (startPromise) {
      return startPromise;
    }

    const startGeneration = generation;
    startPromise = (async () => {
      const packageDefinition = options.protoLoader.loadSync(options.protoPath, options.protoLoaderOptions);
      const loaded = options.grpc.loadPackageDefinition(packageDefinition);
      const proto = loadProto(loaded);

      const nextServer = new options.grpc.Server();
      options.register(nextServer, proto);

      await new Promise<void>((resolve, reject) => {
        nextServer.bindAsync(
          `${host}:${options.port}`,
          options.grpc.ServerCredentials.createInsecure(),
          (error, boundPort) => {
            if (error) {
              reject(error);
              return;
            }

            if (generation !== startGeneration) {
              nextServer.forceShutdown();
              resolve();
              return;
            }

            if (startAfterBind) {
              nextServer.start?.();
            }

            options.logger?.info?.({ port: boundPort }, options.logMessage ?? "gRPC server listening");
            resolve();
          },
        );
      });

      if (generation !== startGeneration) {
        nextServer.forceShutdown();
        return;
      }

      server = nextServer;
    })().finally(() => {
      startPromise = null;
    });

    return startPromise;
  };

  const stop = (): void => {
    generation += 1;
    startPromise = null;

    if (server) {
      server.forceShutdown();
      server = null;
    }
  };

  return { start, stop };
}
