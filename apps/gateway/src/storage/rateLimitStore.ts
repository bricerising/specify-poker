import { withRedisClient } from './redisClient';

export async function incrementRateLimit(key: string, windowMs: number): Promise<number> {
  return await withRedisClient(
    async (redis) => {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.pExpire(key, windowMs);
      }
      return current;
    },
    {
      fallback: 0,
      logMessage: 'ratelimit.increment.failed',
      context: { key },
    },
  );
}

export async function getRateLimit(key: string): Promise<number> {
  return await withRedisClient(
    async (redis) => {
      const val = await redis.get(key);
      return val ? Number.parseInt(val, 10) : 0;
    },
    {
      fallback: 0,
      logMessage: 'ratelimit.get.failed',
      context: { key },
    },
  );
}
