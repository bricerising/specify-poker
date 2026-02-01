import logger from '../observability/logger';
import { getRedisClient } from './redisClient';

let lastRedisErrorLogAt = 0;
const REDIS_ERROR_LOG_THROTTLE_MS = 10_000;

function maybeLogRedisError(error: unknown, context: Record<string, unknown>): void {
  const now = Date.now();
  if (now - lastRedisErrorLogAt < REDIS_ERROR_LOG_THROTTLE_MS) {
    return;
  }
  lastRedisErrorLogAt = now;
  logger.error({ err: error, ...context }, 'ratelimit.redis.failed');
}

export async function incrementRateLimit(key: string, windowMs: number): Promise<number | null> {
  const redis = await getRedisClient();
  if (!redis) {
    maybeLogRedisError(new Error('redis_unavailable'), { key });
    return null;
  }

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.pExpire(key, windowMs);
    }
    return current;
  } catch (err: unknown) {
    maybeLogRedisError(err, { key });
    return null;
  }
}

export async function getRateLimit(key: string): Promise<number | null> {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const val = await redis.get(key);
    return val ? Number.parseInt(val, 10) : 0;
  } catch (err: unknown) {
    maybeLogRedisError(err, { key });
    return null;
  }
}
