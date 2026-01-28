import type { Statistics } from '../domain/types';
import { getRedisClient } from './redisClient';
import { decodeStatistics } from '../domain/decoders';

const STATS_TTL_SECONDS = 60;

function statsKey(userId: string): string {
  return `player:stats:${userId}`;
}

export async function get(userId: string): Promise<Statistics | null> {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }
  const data = await redis.get(statsKey(userId));
  if (!data) {
    return null;
  }
  try {
    return decodeStatistics(JSON.parse(data));
  } catch {
    return null;
  }
}

export async function set(stats: Statistics): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.set(statsKey(stats.userId), JSON.stringify(stats), {
    EX: STATS_TTL_SECONDS,
  });
}

export async function invalidate(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.del(statsKey(userId));
}
