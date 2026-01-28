import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRedisClient, closeRedisClient } from '../../src/storage/redisClient';
import { createClient } from 'redis';

vi.mock('redis', () => {
  const connect = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn();
  const quit = vi.fn().mockResolvedValue(undefined);
  return {
    createClient: vi.fn(() => ({
      connect,
      on,
      quit,
    })),
  };
});

describe('redisClient', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await closeRedisClient();
  });

  it('should create and connect redis client', async () => {
    const client = await getRedisClient();
    expect(createClient).toHaveBeenCalled();
    expect(client.connect).toHaveBeenCalled();
  });

  it('should return the same client instance', async () => {
    const client1 = await getRedisClient();
    const client2 = await getRedisClient();
    expect(client1).toBe(client2);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('should close client', async () => {
    await getRedisClient();
    await closeRedisClient();
    expect(createClient).toHaveBeenCalledTimes(1);
    // Since we cleared mocks and closeRedisClient sets client to null,
    // we can check if it creates a new one next time
    await getRedisClient();
    expect(createClient).toHaveBeenCalledTimes(2);
  });
});
