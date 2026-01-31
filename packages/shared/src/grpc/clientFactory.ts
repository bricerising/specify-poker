type GrpcModuleLike = {
  loadPackageDefinition(packageDefinition: unknown): unknown;
};

type ProtoLoaderModuleLike = {
  loadSync(filename: string | string[], options?: unknown): unknown;
};

export type GrpcClientConstructor<TClient, TCredentials = unknown> = new (
  address: string,
  credentials: TCredentials,
) => TClient;

export type GrpcServiceClientFactory<TClient, TCredentials = unknown> = {
  createClient(options: { address: string; credentials: TCredentials }): TClient;
};

type CreateGrpcServiceClientFactoryOptions<TProto, TClient, TCredentials = unknown> = {
  grpc: GrpcModuleLike;
  protoLoader: ProtoLoaderModuleLike;
  protoPath: string | string[];
  protoLoaderOptions: unknown;
  loadProto?: (loaded: unknown) => TProto;
  getServiceConstructor: (proto: TProto) => GrpcClientConstructor<TClient, TCredentials>;
};

export type GrpcServiceClientFactoryBuilder<TCredentials = unknown> = {
  service<TProto, TClient>(options: {
    protoPath: string | string[];
    protoLoaderOptions?: unknown;
    loadProto?: (loaded: unknown) => TProto;
    getServiceConstructor: (proto: TProto) => GrpcClientConstructor<TClient, TCredentials>;
  }): GrpcServiceClientFactory<TClient, TCredentials>;
};

/**
 * Abstract Factory: create multiple compatible service client factories
 * that share the same grpc/proto-loader modules and default loader options.
 */
export function createGrpcServiceClientFactoryBuilder<TCredentials = unknown>(options: {
  grpc: GrpcModuleLike;
  protoLoader: ProtoLoaderModuleLike;
  protoLoaderOptions: unknown;
}): GrpcServiceClientFactoryBuilder<TCredentials> {
  return {
    service: <TProto, TClient>(serviceOptions: {
      protoPath: string | string[];
      protoLoaderOptions?: unknown;
      loadProto?: (loaded: unknown) => TProto;
      getServiceConstructor: (proto: TProto) => GrpcClientConstructor<TClient, TCredentials>;
    }): GrpcServiceClientFactory<TClient, TCredentials> =>
      createGrpcServiceClientFactory<TProto, TClient, TCredentials>({
        grpc: options.grpc,
        protoLoader: options.protoLoader,
        protoPath: serviceOptions.protoPath,
        protoLoaderOptions: serviceOptions.protoLoaderOptions ?? options.protoLoaderOptions,
        loadProto: serviceOptions.loadProto,
        getServiceConstructor: serviceOptions.getServiceConstructor,
      }),
  };
}

export function createGrpcServiceClientFactory<TProto, TClient, TCredentials = unknown>(
  options: CreateGrpcServiceClientFactoryOptions<TProto, TClient, TCredentials>,
): GrpcServiceClientFactory<TClient, TCredentials> {
  const loadProto = options.loadProto ?? ((loaded: unknown) => loaded as TProto);

  let cachedConstructor: GrpcClientConstructor<TClient, TCredentials> | null = null;

  const getConstructor = (): GrpcClientConstructor<TClient, TCredentials> => {
    if (cachedConstructor) {
      return cachedConstructor;
    }

    const packageDefinition = options.protoLoader.loadSync(
      options.protoPath,
      options.protoLoaderOptions,
    );
    const loaded = options.grpc.loadPackageDefinition(packageDefinition);
    const proto = loadProto(loaded);

    cachedConstructor = options.getServiceConstructor(proto);
    return cachedConstructor;
  };

  return {
    createClient: ({ address, credentials }) => {
      const Ctor = getConstructor();
      return new Ctor(address, credentials);
    },
  };
}
