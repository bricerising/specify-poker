import { createRedisClientManager as createSharedRedisClientManager } from '@specify-poker/shared/redis';
import type {
  RedisClientLogger,
  RedisClientManager as SharedRedisClientManager,
} from '@specify-poker/shared/redis';
import type { RedisClientType } from 'redis';
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

let defaultManager: RedisClientManager | null = null;

function getDefaultManager(): RedisClientManager {
  if (!defaultManager) {
    defaultManager = createRedisClientManager({ url: getRedisUrl() });
  }
  return defaultManager;
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  return getDefaultManager().getClientOrNull();
}

export async function getBlockingRedisClient(): Promise<RedisClientType | null> {
  return getDefaultManager().getBlockingClientOrNull();
}

export async function closeRedisClient(): Promise<void> {
  if (!defaultManager) {
    return;
  }

  await defaultManager.close();
  defaultManager = null;
}
