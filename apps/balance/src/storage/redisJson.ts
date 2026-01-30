import logger from '../observability/logger';
import { tryJsonParse } from '../utils/json';
import { getRedisClient } from './redisClient';

type LogContext = Record<string, unknown>;

function parseJsonOrNull<T>(payload: string, log: { event: string; context?: LogContext }): T | null {
  const parsed = tryJsonParse<T>(payload);
  if (!parsed.ok) {
    logger.warn({ err: parsed.error, ...(log.context ?? {}) }, log.event);
    return null;
  }
  return parsed.value;
}

export async function redisGetJson<T>(
  key: string,
  log: { event: string; context?: LogContext },
): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }

  const payload = await redis.get(key);
  if (!payload) {
    return null;
  }

  return parseJsonOrNull<T>(payload, log);
}

export async function redisSetJson(key: string, value: unknown): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  await redis.set(key, JSON.stringify(value));
}

export async function redisSetExJson(key: string, ttlSeconds: number, value: unknown): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

export async function redisHGetJson<T>(
  hashKey: string,
  field: string,
  log: { event: string; context?: LogContext },
): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }

  const payload = await redis.hGet(hashKey, field);
  if (!payload) {
    return null;
  }

  return parseJsonOrNull<T>(payload, log);
}

export async function redisHSetJson(hashKey: string, field: string, value: unknown): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  await redis.hSet(hashKey, field, JSON.stringify(value));
}

export async function redisRPushJson(key: string, value: unknown): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  await redis.rPush(key, JSON.stringify(value));
}
