import {
  createRedisClientManager as createSharedRedisClientManager,
  createRedisClientsFacade,
  type RedisClient,
  type RedisClientLogger,
  type RedisClientManager as SharedRedisClientManager,
} from '@specify-poker/shared/redis';
import { getConfig } from '../config';
import logger from '../observability/logger';

export type RedisClientManager = Pick<
  SharedRedisClientManager,
  'getClientOrNull' | 'getBlockingClientOrNull' | 'close'
>;

type CreateRedisClientManagerOptions = {
  url: string | null;
  createClient?: Parameters<typeof createSharedRedisClientManager>[0]['createClient'];
  log?: RedisClientLogger;
  name?: string;
};

export function createRedisClientManager(
  options: CreateRedisClientManagerOptions,
): RedisClientManager {
  return createSharedRedisClientManager({
    url: options.url,
    createClient: options.createClient,
    log: options.log ?? logger,
    name: options.name ?? 'player',
  });
}

export function getRedisUrl(): string | null {
  return getConfig().redisUrl;
}

export function isRedisEnabled(): boolean {
  return Boolean(getRedisUrl());
}

const redis = createRedisClientsFacade({
  getUrl: () => getRedisUrl(),
  log: logger,
  name: 'player',
});

export async function getRedisClient(): Promise<RedisClient | null> {
  return redis.getClientOrNull();
}

export async function getBlockingRedisClient(): Promise<RedisClient | null> {
  return redis.getBlockingClientOrNull();
}

export async function closeRedisClient(): Promise<void> {
  await redis.close();
}
