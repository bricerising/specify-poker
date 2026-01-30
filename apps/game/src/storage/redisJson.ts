import { safeJsonParse } from '../utils/json';

type RedisClientLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

type Guard<T> = (value: unknown) => value is T;

export type RedisJsonFacade = {
  get<T>(key: string, guard: Guard<T>): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
};

export function createRedisJsonFacade(client: RedisClientLike): RedisJsonFacade {
  const get = async <T>(key: string, guard: Guard<T>): Promise<T | null> => {
    const data = await client.get(key);
    if (!data) {
      return null;
    }

    const parsed = safeJsonParse(data);
    if (parsed === null) {
      return null;
    }

    return guard(parsed) ? parsed : null;
  };

  const set = async (key: string, value: unknown): Promise<void> => {
    await client.set(key, JSON.stringify(value));
  };

  const del = async (key: string): Promise<void> => {
    await client.del(key);
  };

  return { get, set, del };
}
