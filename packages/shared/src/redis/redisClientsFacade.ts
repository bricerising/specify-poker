import { createAsyncDisposableLazyValue } from '../lifecycle/asyncDisposableLazyValue';
import { createAsyncMethodProxy } from '../proxy/asyncMethodProxy';
import {
  createRedisClientManager,
  type RedisClient,
  type RedisClientLogger,
} from './redisClientManager';

export type RedisClientsFacade = {
  isEnabled(): boolean;
  getClient(): Promise<RedisClient>;
  getClientOrNull(): Promise<RedisClient | null>;
  getBlockingClient(): Promise<RedisClient>;
  getBlockingClientOrNull(): Promise<RedisClient | null>;
  client: RedisClient;
  blockingClient: RedisClient;
  close(): Promise<void>;
  resetForTests(): void;
};

type CreateRedisClientsFacadeOptions = {
  getUrl: () => string | null;
  createClient?: Parameters<typeof createRedisClientManager>[0]['createClient'];
  log?: RedisClientLogger;
  name: string;
};

/**
 * Creates a stable facade around a Redis client family (regular + blocking), with:
 * - lazy manager construction
 * - stable proxies for call sites that assume Redis is required
 * - explicit close/reset hooks for clean shutdown and tests
 */
export function createRedisClientsFacade(
  options: CreateRedisClientsFacadeOptions,
): RedisClientsFacade {
  const lazyManager = createAsyncDisposableLazyValue(
    () =>
      createRedisClientManager({
        url: options.getUrl(),
        createClient: options.createClient,
        log: options.log,
        name: options.name,
      }),
    (manager) => manager.close(),
  );

  const getManager = () => lazyManager.get();

  const getClient = () => getManager().getClient();
  const getClientOrNull = () => getManager().getClientOrNull();
  const getBlockingClient = () => getManager().getBlockingClient();
  const getBlockingClientOrNull = () => getManager().getBlockingClientOrNull();

  return {
    isEnabled: () => Boolean(options.getUrl()),
    getClient,
    getClientOrNull,
    getBlockingClient,
    getBlockingClientOrNull,
    client: createAsyncMethodProxy(getClient),
    blockingClient: createAsyncMethodProxy(getBlockingClient),
    close: () => lazyManager.dispose(),
    resetForTests: () => lazyManager.reset(),
  };
}

