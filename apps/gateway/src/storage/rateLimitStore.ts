import { getRedisClient } from './redisClient';
import logger from '../observability/logger';

export async function incrementRateLimit(key: string, windowMs: number): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 0;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.pExpire(key, windowMs);
    }
    return current;
  } catch (err) {
    logger.error({ err, key }, 'Failed to increment rate limit in Redis');
    return 0;
  }
}

export async function getRateLimit(key: string): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 0;

  try {
    const val = await redis.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch (err) {
    logger.error({ err, key }, 'Failed to get rate limit from Redis');
    return 0;
  }
}
