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
  'getClient' | 'getBlockingClient' | 'close'
>;

type CreateRedisClientManagerOptions = {
  url: string;
  createClient?: Parameters<typeof createSharedRedisClientManager>[0]['createClient'];
  log?: RedisClientLogger;
};

export function createRedisClientManager(
  options: CreateRedisClientManagerOptions,
): RedisClientManager {
  return createSharedRedisClientManager({
    url: options.url,
    createClient: options.createClient,
    log: options.log ?? logger,
    name: 'notify',
  });
}

const redis = createRedisClientsFacade({
  getUrl: () => getConfig().redisUrl,
  log: logger,
  name: 'notify',
});

export async function getRedisClient(): Promise<RedisClient> {
  return redis.getClient();
}

export async function getBlockingRedisClient(): Promise<RedisClient> {
  return redis.getBlockingClient();
}

export async function closeRedisClient(): Promise<void> {
  await redis.close();
}
