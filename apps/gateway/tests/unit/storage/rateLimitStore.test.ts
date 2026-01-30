import { describe, it, expect, vi, beforeEach } from 'vitest';

const redis = {
  incr: vi.fn(),
  pExpire: vi.fn(),
  get: vi.fn(),
};

vi.mock('../../../src/storage/redisClient', () => ({
  getRedisClient: () => redis,
  withRedisClient: async (operation: (client: typeof redis) => Promise<unknown>, options: any) => {
    const client = redis;
    if (!client) {
      return options.fallback;
    }
    try {
      return await operation(client);
    } catch {
      return options.fallback;
    }
  },
}));

vi.mock('../../../src/observability/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('Rate limit store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments and sets expiry on first hit', async () => {
    redis.incr.mockResolvedValueOnce(1);
    const { incrementRateLimit } = await import('../../../src/storage/rateLimitStore');
    const count = await incrementRateLimit('key', 1000);

    expect(count).toBe(1);
    expect(redis.pExpire).toHaveBeenCalledWith('key', 1000);
  });

  it('returns current count on subsequent hits', async () => {
    redis.incr.mockResolvedValueOnce(5);
    const { incrementRateLimit } = await import('../../../src/storage/rateLimitStore');
    const count = await incrementRateLimit('key', 1000);

    expect(count).toBe(5);
    expect(redis.pExpire).not.toHaveBeenCalled();
  });

  it('returns 0 when increment fails', async () => {
    redis.incr.mockRejectedValueOnce(new Error('down'));
    const { incrementRateLimit } = await import('../../../src/storage/rateLimitStore');
    const count = await incrementRateLimit('key', 1000);

    expect(count).toBe(0);
  });

  it('gets rate limit value', async () => {
    redis.get.mockResolvedValueOnce('12');
    const { getRateLimit } = await import('../../../src/storage/rateLimitStore');
    const count = await getRateLimit('key');

    expect(count).toBe(12);
  });
});
