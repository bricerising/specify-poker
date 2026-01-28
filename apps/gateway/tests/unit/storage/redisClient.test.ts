import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisClient = {
  on: vi.fn(),
  connect: vi.fn(),
  quit: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => redisClient),
}));

vi.mock('../../../src/config', () => ({
  getConfig: () => ({ redisUrl: 'redis://localhost:6379' }),
}));

vi.mock('../../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Redis client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    redisClient.connect.mockResolvedValue(undefined);
    redisClient.quit.mockResolvedValue(undefined);
  });

  it('creates and caches a redis client', async () => {
    const { getRedisClient } = await import('../../../src/storage/redisClient');
    const clientA = await getRedisClient();
    const clientB = await getRedisClient();

    expect(clientA).toBe(redisClient);
    expect(clientB).toBe(redisClient);
    expect(redisClient.connect).toHaveBeenCalledTimes(1);
  });

  it('returns null when connection fails', async () => {
    redisClient.connect.mockRejectedValueOnce(new Error('down'));
    const { getRedisClient } = await import('../../../src/storage/redisClient');
    const client = await getRedisClient();

    expect(client).toBeNull();
  });

  it('closes the redis client', async () => {
    const { getRedisClient, closeRedisClient } = await import('../../../src/storage/redisClient');
    await getRedisClient();
    await closeRedisClient();

    expect(redisClient.quit).toHaveBeenCalled();
  });
});
