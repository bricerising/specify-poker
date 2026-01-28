import { describe, expect, it, vi } from 'vitest';

const redisState = {
  isOpen: false,
  connect: vi.fn(async () => {
    redisState.isOpen = true;
  }),
  quit: vi.fn(async () => {
    redisState.isOpen = false;
  }),
  on: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: () => redisState,
}));

describe('redisClient', () => {
  it('connects and closes the Redis client', async () => {
    const { connectRedis, closeRedisClient } = await import('../../src/storage/redisClient');

    await connectRedis();
    expect(redisState.connect).toHaveBeenCalledTimes(1);
    expect(redisState.isOpen).toBe(true);

    await closeRedisClient();
    expect(redisState.quit).toHaveBeenCalledTimes(1);
    expect(redisState.isOpen).toBe(false);
  });
});
