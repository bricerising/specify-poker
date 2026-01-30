import { getConfig } from '../config';
import logger from '../observability/logger';
import { createKeyedLock } from '../utils/keyedLock';
import { tryJsonParse } from '../utils/json';
import { getRedisClient } from './redisClient';

const IDEMPOTENCY_PREFIX = 'balance:transactions:idempotency:';

// In-memory cache with TTL, bounded (LRU) by `IDEMPOTENCY_CACHE_MAX_ENTRIES`.
const idempotencyCache = new Map<string, { response: string; expiresAt: number }>();
const idempotencyLock = createKeyedLock();

export async function withIdempotencyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  return idempotencyLock.withLock(key, work);
}

function enforceCacheLimit(maxEntries: number): void {
  if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
    return;
  }

  while (idempotencyCache.size > maxEntries) {
    const oldestKey = idempotencyCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    idempotencyCache.delete(oldestKey);
  }
}

export async function getIdempotentResponse(key: string): Promise<unknown | null> {
  // Check cache first
  const cached = idempotencyCache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      // Touch for LRU.
      idempotencyCache.delete(key);
      idempotencyCache.set(key, cached);

      const parsed = tryJsonParse<unknown>(cached.response);
      if (!parsed.ok) {
        logger.warn({ err: parsed.error, key }, 'idempotencyStore.parse.failed');
        idempotencyCache.delete(key);
        return null;
      }
      return parsed.value;
    }
    idempotencyCache.delete(key);
  }

  const redis = await getRedisClient();
  if (redis) {
    const response = await redis.get(`${IDEMPOTENCY_PREFIX}${key}`);
    if (response) {
      const parsed = tryJsonParse<unknown>(response);
      if (!parsed.ok) {
        logger.warn({ err: parsed.error, key }, 'idempotencyStore.parse.failed');
        return null;
      }
      return parsed.value;
    }
  }

  return null;
}

export async function setIdempotentResponse(key: string, response: unknown): Promise<void> {
  const config = getConfig();
  const ttlMs = config.idempotencyTtlMs;
  const expiresAt = Date.now() + ttlMs;

  const serialized = JSON.stringify(response);

  // Update cache
  idempotencyCache.set(key, { response: serialized, expiresAt });
  enforceCacheLimit(config.idempotencyCacheMaxEntries);

  // Persist to Redis with TTL
  const redis = await getRedisClient();
  if (redis) {
    await redis.setEx(`${IDEMPOTENCY_PREFIX}${key}`, Math.floor(ttlMs / 1000), serialized);
  }
}

export async function hasIdempotencyKey(key: string): Promise<boolean> {
  const response = await getIdempotentResponse(key);
  return response !== null;
}

export function cleanExpiredIdempotencyKeys(): void {
  const now = Date.now();
  for (const [key, value] of idempotencyCache) {
    if (value.expiresAt <= now) {
      idempotencyCache.delete(key);
    }
  }
}

export async function resetIdempotency(): Promise<void> {
  idempotencyCache.clear();
  idempotencyLock.reset();
  // Note: Redis keys will expire naturally via TTL
}
