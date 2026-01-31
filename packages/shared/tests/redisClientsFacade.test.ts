import { describe, expect, it, vi } from 'vitest';

import { createRedisClientsFacade } from '../src/redis/redisClientsFacade';

function createRedisClientPair() {
  const blocking = {
    isOpen: false,
    connect: vi.fn(async () => {
      blocking.isOpen = true;
    }),
    quit: vi.fn(async () => {
      blocking.isOpen = false;
    }),
    on: vi.fn(),
  };

  const client = {
    isOpen: false,
    connect: vi.fn(async () => {
      client.isOpen = true;
    }),
    quit: vi.fn(async () => {
      client.isOpen = false;
    }),
    on: vi.fn(),
    get: vi.fn(async (key: string) => `value:${key}`),
    duplicate: vi.fn(() => blocking),
  };

  return { client, blocking };
}

describe('createRedisClientsFacade', () => {
  it('does not create clients until first use', async () => {
    const pairs: Array<ReturnType<typeof createRedisClientPair>> = [];
    const createClient = vi.fn(() => {
      const pair = createRedisClientPair();
      pairs.push(pair);
      return pair.client;
    });

    const redis = createRedisClientsFacade({
      getUrl: () => 'redis://example:6379',
      createClient: createClient as unknown as Parameters<typeof createRedisClientsFacade>[0]['createClient'],
      name: 'test',
    });

    expect(redis.isEnabled()).toBe(true);
    expect(createClient).toHaveBeenCalledTimes(0);

    await redis.getClient();

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(pairs[0].client.connect).toHaveBeenCalledTimes(1);
  });

  it('proxies methods via redis.client', async () => {
    const pair = createRedisClientPair();
    const createClient = vi.fn(() => pair.client);

    const redis = createRedisClientsFacade({
      getUrl: () => 'redis://example:6379',
      createClient: createClient as unknown as Parameters<typeof createRedisClientsFacade>[0]['createClient'],
      name: 'test',
    });

    const value = await redis.client.get('a');

    expect(value).toBe('value:a');
    expect(pair.client.connect).toHaveBeenCalledTimes(1);
    expect(pair.client.get).toHaveBeenCalledWith('a');
  });

  it('closes clients and allows re-creation', async () => {
    const pairs: Array<ReturnType<typeof createRedisClientPair>> = [];
    const createClient = vi.fn(() => {
      const pair = createRedisClientPair();
      pairs.push(pair);
      return pair.client;
    });

    const redis = createRedisClientsFacade({
      getUrl: () => 'redis://example:6379',
      createClient: createClient as unknown as Parameters<typeof createRedisClientsFacade>[0]['createClient'],
      name: 'test',
    });

    await redis.getClient();
    await redis.getBlockingClient();
    await redis.close();

    expect(pairs[0].client.quit).toHaveBeenCalledTimes(1);
    expect(pairs[0].blocking.quit).toHaveBeenCalledTimes(1);

    await redis.getClient();

    expect(createClient).toHaveBeenCalledTimes(2);
    expect(pairs[1].client.connect).toHaveBeenCalledTimes(1);
  });
});

