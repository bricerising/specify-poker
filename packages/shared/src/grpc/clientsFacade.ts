import { createDisposableLazyProxy, type DisposableLazyProxy } from '../lifecycle/disposableLazyProxy';
import { createLazyValue } from '../lifecycle/lazyValue';
import type { GrpcServiceClientFactory } from './clientFactory';

export type GrpcClientDefinition<TClient extends object, TConfig, TCredentials> = {
  factory: GrpcServiceClientFactory<TClient, TCredentials>;
  selectAddress: (config: TConfig) => string;
};

type ObjectValuedRecord<T extends object> = { [K in keyof T]: object };

export type GrpcClientsFacade<TClients extends ObjectValuedRecord<TClients>> = {
  /**
   * Stable proxy references for each client.
   *
   * The underlying client instance is created lazily (first call).
   */
  clients: TClients;
  getClient<K extends keyof TClients>(key: K): TClients[K];
  close(): void;
  resetForTests(): void;
};

type CreateGrpcClientsFacadeOptions<
  TConfig,
  TCredentials,
  TClients extends ObjectValuedRecord<TClients>,
> = {
  getConfig: () => TConfig;
  createCredentials: () => TCredentials;
  definitions: { [K in keyof TClients]: GrpcClientDefinition<TClients[K], TConfig, TCredentials> };
  disposeClient: (client: unknown) => void;
};

/**
 * Builds a stable facade around a family of gRPC clients, with:
 * - lazy construction per client
 * - shared credential creation (single cached instance)
 * - centralized close/reset hooks for clean shutdown and tests
 *
 * This is an Abstract Factory in practice: callers select the “family” by
 * providing a credential-creation strategy at the composition root.
 */
export function createGrpcClientsFacade<
  TConfig,
  TCredentials,
  TClients extends ObjectValuedRecord<TClients>,
>(options: CreateGrpcClientsFacadeOptions<TConfig, TCredentials, TClients>): GrpcClientsFacade<TClients> {
  const credentials = createLazyValue(options.createCredentials);

  const lazyClients = {} as { [K in keyof TClients]: DisposableLazyProxy<TClients[K]> };

  const keys = Object.keys(options.definitions) as Array<keyof TClients>;
  for (const key of keys) {
    const definition = options.definitions[key];

    lazyClients[key] = createDisposableLazyProxy(
      () => {
        const config = options.getConfig();
        return definition.factory.createClient({
          address: definition.selectAddress(config),
          credentials: credentials.get(),
        });
      },
      (client) => options.disposeClient(client),
    );
  }

  const clientProxies = {} as TClients;
  for (const key of keys) {
    clientProxies[key] = lazyClients[key].proxy;
  }

  const disposeAll = (): void => {
    for (const key of keys) {
      lazyClients[key].dispose();
    }
  };

  return {
    clients: clientProxies,
    getClient: (key) => lazyClients[key].get(),
    close: () => {
      disposeAll();
    },
    resetForTests: () => {
      credentials.reset();
      disposeAll();
    },
  };
}
