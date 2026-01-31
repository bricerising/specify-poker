import { describe, expect, it, vi } from 'vitest';

import { createGrpcClientsFacade } from '../src/grpc/clientsFacade';

describe('createGrpcClientsFacade', () => {
  it('lazily creates clients and shares credentials', () => {
    type Config = { aAddr: string; bAddr: string };
    type Credentials = { token: string };

    type Client = {
      ping: () => string;
    };

    const getConfig = vi.fn<[], Config>(() => ({ aAddr: 'a:1234', bAddr: 'b:5678' }));
    const createCredentials = vi.fn<[], Credentials>(() => ({ token: 't' }));
    const disposeClient = vi.fn((_: unknown) => undefined);

    const factoryA = {
      createClient: vi.fn(({ address, credentials }: { address: string; credentials: Credentials }): Client => ({
        ping: () => `a:${address}:${credentials.token}`,
      })),
    };

    const factoryB = {
      createClient: vi.fn(({ address, credentials }: { address: string; credentials: Credentials }): Client => ({
        ping: () => `b:${address}:${credentials.token}`,
      })),
    };

    const facade = createGrpcClientsFacade<Config, Credentials, { a: Client; b: Client }>({
      getConfig,
      createCredentials,
      disposeClient,
      definitions: {
        a: { factory: factoryA, selectAddress: (config) => config.aAddr },
        b: { factory: factoryB, selectAddress: (config) => config.bAddr },
      },
    });

    expect(createCredentials).toHaveBeenCalledTimes(0);
    expect(factoryA.createClient).toHaveBeenCalledTimes(0);
    expect(factoryB.createClient).toHaveBeenCalledTimes(0);

    expect(facade.clients.a.ping()).toBe('a:a:1234:t');
    expect(createCredentials).toHaveBeenCalledTimes(1);
    expect(factoryA.createClient).toHaveBeenCalledTimes(1);
    expect(factoryB.createClient).toHaveBeenCalledTimes(0);

    expect(facade.clients.b.ping()).toBe('b:b:5678:t');
    expect(createCredentials).toHaveBeenCalledTimes(1);
    expect(factoryA.createClient).toHaveBeenCalledTimes(1);
    expect(factoryB.createClient).toHaveBeenCalledTimes(1);

    const credsA = factoryA.createClient.mock.calls[0]?.[0]?.credentials;
    const credsB = factoryB.createClient.mock.calls[0]?.[0]?.credentials;
    expect(credsA).toBe(credsB);
  });

  it('close recreates clients but preserves credentials', () => {
    type Config = { addr: string };
    type Credentials = { id: number };
    type Client = { id: number };

    const getConfig = vi.fn<[], Config>(() => ({ addr: 'svc:1' }));
    const createCredentials = vi.fn<[], Credentials>(() => ({ id: 1 }));
    const disposeClient = vi.fn((_: unknown) => undefined);

    const factory = {
      createClient: vi.fn(({ credentials }: { address: string; credentials: Credentials }): Client => ({
        id: credentials.id,
      })),
    };

    const facade = createGrpcClientsFacade<Config, Credentials, { svc: Client }>({
      getConfig,
      createCredentials,
      disposeClient,
      definitions: {
        svc: { factory, selectAddress: (config) => config.addr },
      },
    });

    expect(facade.clients.svc.id).toBe(1);
    facade.close();

    expect(disposeClient).toHaveBeenCalledTimes(1);
    expect(facade.clients.svc.id).toBe(1);
    expect(createCredentials).toHaveBeenCalledTimes(1);
  });

  it('resetForTests recreates credentials', () => {
    type Config = { addr: string };
    type Credentials = { id: number };
    type Client = { credentials: Credentials };

    const getConfig = vi.fn<[], Config>(() => ({ addr: 'svc:1' }));
    const createCredentials = vi
      .fn<[], Credentials>()
      .mockReturnValueOnce({ id: 1 })
      .mockReturnValueOnce({ id: 2 });
    const disposeClient = vi.fn((_: unknown) => undefined);

    const factory = {
      createClient: vi.fn(({ credentials }: { address: string; credentials: Credentials }): Client => ({
        credentials,
      })),
    };

    const facade = createGrpcClientsFacade<Config, Credentials, { svc: Client }>({
      getConfig,
      createCredentials,
      disposeClient,
      definitions: {
        svc: { factory, selectAddress: (config) => config.addr },
      },
    });

    const client1 = facade.getClient('svc');
    facade.resetForTests();
    const client2 = facade.getClient('svc');

    expect(createCredentials).toHaveBeenCalledTimes(2);
    expect(client1.credentials.id).toBe(1);
    expect(client2.credentials.id).toBe(2);
    expect(client1.credentials).not.toBe(client2.credentials);
  });
});
