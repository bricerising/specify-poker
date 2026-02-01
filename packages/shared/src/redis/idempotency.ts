import { randomUUID } from 'node:crypto';
import type { RedisClient } from './redisClientManager';

type StoredValue<T> =
  | { v: 1; state: 'inflight'; token: string }
  | { v: 1; state: 'done'; value: T };

function safeJsonParse<T>(raw: string): StoredValue<T> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1) {
      return null;
    }
    if (record.state === 'inflight' && typeof record.token === 'string') {
      return { v: 1, state: 'inflight', token: record.token };
    }
    if (record.state === 'done' && 'value' in record) {
      return { v: 1, state: 'done', value: record.value as T };
    }
    return null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function releaseInflightLock(options: {
  redis: RedisClient;
  redisKey: string;
  token: string;
}): Promise<void> {
  const current = await options.redis.get(options.redisKey);
  if (!current) {
    return;
  }
  const parsed = safeJsonParse<unknown>(current);
  if (parsed?.state !== 'inflight' || parsed.token !== options.token) {
    return;
  }
  await options.redis.del(options.redisKey);
}

export class IdempotencyInProgressError extends Error {
  constructor(message = 'IDEMPOTENCY_IN_PROGRESS') {
    super(message);
  }
}

export type RedisIdempotencyOutcome = 'cached' | 'computed';

/**
 * Runs an operation with Redis-backed idempotency and an "inflight" lease:
 * - returns cached results for duplicate `idempotencyKey`s
 * - ensures only one caller executes the operation at a time per key
 * - caches only successful results (as decided by `isSuccess`)
 */
export async function runRedisIdempotent<T>(options: {
  redis: RedisClient;
  /**
   * Fully-qualified Redis key (include method/service prefix yourself).
   */
  redisKey: string;
  /**
   * The idempotency key value (used only for generating a lock token).
   */
  idempotencyKey: string;
  /**
   * How long to keep the cached result.
   */
  ttlMs: number;
  /**
   * How long a caller may hold the inflight lease.
   */
  leaseMs?: number;
  /**
   * How long a duplicate caller should wait for an inflight request to finish.
   */
  waitMs?: number;
  /**
   * Poll interval while waiting for inflight completion.
   */
  pollMs?: number;
  isSuccess: (result: T) => boolean;
  operation: () => Promise<T>;
}): Promise<{ value: T; outcome: RedisIdempotencyOutcome }> {
  const leaseMs = options.leaseMs ?? Math.min(options.ttlMs, 15_000);
  const waitMs = options.waitMs ?? Math.min(options.ttlMs, 5_000);
  const pollMs = options.pollMs ?? 50;

  const cachedRaw = await options.redis.get(options.redisKey);
  if (cachedRaw) {
    const cachedParsed = safeJsonParse<T>(cachedRaw);
    if (cachedParsed?.state === 'done') {
      return { value: cachedParsed.value, outcome: 'cached' };
    }
  }

  const token = randomUUID();
  const inflight: StoredValue<T> = { v: 1, state: 'inflight', token };
  const acquired = await options.redis.set(options.redisKey, JSON.stringify(inflight), {
    NX: true,
    PX: leaseMs,
  });

  if (acquired) {
    try {
      const value = await options.operation();

      if (options.isSuccess(value)) {
        const stored: StoredValue<T> = { v: 1, state: 'done', value };
        await options.redis.set(options.redisKey, JSON.stringify(stored), { PX: options.ttlMs });
      } else {
        await releaseInflightLock({ redis: options.redis, redisKey: options.redisKey, token });
      }

      return { value, outcome: 'computed' };
    } catch (error: unknown) {
      await releaseInflightLock({ redis: options.redis, redisKey: options.redisKey, token });
      throw error;
    }
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < waitMs) {
    const currentRaw = await options.redis.get(options.redisKey);
    if (!currentRaw) {
      // Lock expired or was released. Try to acquire on the next loop.
      break;
    }

    const current = safeJsonParse<T>(currentRaw);
    if (current?.state === 'done') {
      return { value: current.value, outcome: 'cached' };
    }

    await sleep(pollMs);
  }

  throw new IdempotencyInProgressError();
}

