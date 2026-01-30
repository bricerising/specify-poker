import { getRedisClient } from './redisClient';

type JsonDecoder<T> = (value: unknown) => T | null;
type JsonEncoder<T> = (value: T) => unknown;

type RedisClient = NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function encodeJson<T>(value: T, encode?: JsonEncoder<T>): string | null {
  try {
    return JSON.stringify(encode ? encode(value) : value);
  } catch {
    return null;
  }
}

function decodeJson<T>(value: string, decode: JsonDecoder<T>): T | null {
  const parsed = safeJsonParse(value);
  if (parsed === null) {
    return null;
  }

  try {
    return decode(parsed);
  } catch {
    return null;
  }
}

async function getRedisOrNull(): Promise<RedisClient | null> {
  try {
    return await getRedisClient();
  } catch {
    return null;
  }
}

async function withRedis<T>(fallback: T, fn: (redis: RedisClient) => Promise<T>): Promise<T> {
  const redis = await getRedisOrNull();
  if (!redis) {
    return fallback;
  }

  try {
    return await fn(redis);
  } catch {
    return fallback;
  }
}

async function withRedisNoThrow(fn: (redis: RedisClient) => Promise<void>): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) {
    return;
  }

  try {
    await fn(redis);
  } catch {
    return;
  }
}

export type RedisKeyedJsonCache<TKey, TValue> = {
  get(id: TKey): Promise<TValue | null>;
  getMulti(ids: readonly TKey[]): Promise<Map<TKey, TValue>>;
  set(id: TKey, value: TValue): Promise<void>;
  del(id: TKey): Promise<void>;
};

export function createRedisKeyedJsonCache<TKey, TValue>(options: {
  key: (id: TKey) => string;
  ttlSeconds: number;
  decode: JsonDecoder<TValue>;
  encode?: JsonEncoder<TValue>;
}): RedisKeyedJsonCache<TKey, TValue> {
  return {
    get: async (id) => {
      return withRedis(null, async (redis) => {
        const data = await redis.get(options.key(id));
        if (data === null) {
          return null;
        }
        return decodeJson(data, options.decode);
      });
    },

    getMulti: async (ids) => {
      const result = new Map<TKey, TValue>();
      if (ids.length === 0) {
        return result;
      }

      const redis = await getRedisOrNull();
      if (!redis) {
        return result;
      }

      const keys = ids.map((id) => options.key(id));
      let values: (string | null)[];
      try {
        values = await redis.mGet(keys);
      } catch {
        return result;
      }
      values.forEach((value, index) => {
        if (value === null) {
          return;
        }

        const decoded = decodeJson(value, options.decode);
        if (decoded !== null) {
          result.set(ids[index], decoded);
        }
      });

      return result;
    },

    set: async (id, value) => {
      const encoded = encodeJson(value, options.encode);
      if (encoded === null) {
        return;
      }

      await withRedisNoThrow(async (redis) => {
        await redis.set(options.key(id), encoded, {
          EX: options.ttlSeconds,
        });
      });
    },

    del: async (id) => {
      await withRedisNoThrow(async (redis) => {
        await redis.del(options.key(id));
      });
    },
  };
}

export type RedisKeyedStringCache<TKey> = {
  get(id: TKey): Promise<string | null>;
  getMulti(ids: readonly TKey[]): Promise<Map<TKey, string>>;
  set(id: TKey, value: string): Promise<void>;
  del(id: TKey): Promise<void>;
};

export function createRedisKeyedStringCache<TKey>(options: {
  key: (id: TKey) => string;
  ttlSeconds?: number;
}): RedisKeyedStringCache<TKey> {
  return {
    get: async (id) => {
      return withRedis(null, async (redis) => {
        return redis.get(options.key(id));
      });
    },

    getMulti: async (ids) => {
      const result = new Map<TKey, string>();
      if (ids.length === 0) {
        return result;
      }

      const redis = await getRedisOrNull();
      if (!redis) {
        return result;
      }

      const keys = ids.map((id) => options.key(id));
      let values: (string | null)[];
      try {
        values = await redis.mGet(keys);
      } catch {
        return result;
      }
      values.forEach((value, index) => {
        if (value !== null) {
          result.set(ids[index], value);
        }
      });

      return result;
    },

    set: async (id, value) => {
      const key = options.key(id);
      await withRedisNoThrow(async (redis) => {
        if (options.ttlSeconds === undefined) {
          await redis.set(key, value);
          return;
        }

        await redis.set(key, value, { EX: options.ttlSeconds });
      });
    },

    del: async (id) => {
      await withRedisNoThrow(async (redis) => {
        await redis.del(options.key(id));
      });
    },
  };
}
