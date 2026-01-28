import { createRedisClientManager } from '@specify-poker/shared/redis';
import { getConfig } from '../config';
import logger from '../observability/logger';

export function getRedisUrl(): string | null {
  return getConfig().redisUrl;
}

export function isRedisEnabled(): boolean {
  return Boolean(getRedisUrl());
}

const redis = createRedisClientManager({ url: getRedisUrl(), log: logger, name: 'balance' });

export async function getRedisClient() {
  return redis.getClientOrNull();
}

export async function closeRedisClient(): Promise<void> {
  await redis.close();
}
