import type { Statistics } from '../domain/types';
import { decodeStatistics } from '../domain/decoders';
import { createRedisKeyedJsonCache } from './redisCache';

const STATS_TTL_SECONDS = 60;

function statsKey(userId: string): string {
  return `player:stats:${userId}`;
}

const statsCache = createRedisKeyedJsonCache<string, Statistics>({
  key: statsKey,
  ttlSeconds: STATS_TTL_SECONDS,
  decode: decodeStatistics,
});

export async function get(userId: string): Promise<Statistics | null> {
  return statsCache.get(userId);
}

export async function set(stats: Statistics): Promise<void> {
  await statsCache.set(stats.userId, stats);
}

export async function invalidate(userId: string): Promise<void> {
  await statsCache.del(userId);
}
