import { getConfig } from "../config";
import { getRedisClient } from "./redisClient";

const IDEMPOTENCY_PREFIX = "balance:transactions:idempotency:";

// In-memory cache with expiry
const idempotencyCache = new Map<string, { response: string; expiresAt: number }>();
const idempotencyLocks = new Map<string, Promise<void>>();

export async function withIdempotencyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = idempotencyLocks.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  const chain = previous.then(() => current);
  idempotencyLocks.set(key, chain);

  await previous;
  try {
    return await work();
  } finally {
    release?.();
    void chain.finally(() => {
      if (idempotencyLocks.get(key) === chain) {
        idempotencyLocks.delete(key);
      }
    });
  }
}

export async function getIdempotentResponse(key: string): Promise<unknown | null> {
  // Check cache first
  const cached = idempotencyCache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return JSON.parse(cached.response);
    }
    idempotencyCache.delete(key);
  }

  const redis = await getRedisClient();
  if (redis) {
    const response = await redis.get(`${IDEMPOTENCY_PREFIX}${key}`);
    if (response) {
      return JSON.parse(response);
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
  idempotencyLocks.clear();
  // Note: Redis keys will expire naturally via TTL
}
