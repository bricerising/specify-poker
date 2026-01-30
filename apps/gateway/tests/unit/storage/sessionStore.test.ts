import { describe, it, expect, vi, beforeEach } from 'vitest';

const redis = {
  hDel: vi.fn(),
  hSet: vi.fn(),
  hGet: vi.fn(),
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

describe('Session store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets presence to offline by deleting record', async () => {
    const { updatePresence } = await import('../../../src/storage/sessionStore');
    await updatePresence('user-1', 'offline');

    expect(redis.hDel).toHaveBeenCalledWith('gateway:presence', 'user-1');
  });

  it('sets presence to online/away', async () => {
    const { updatePresence } = await import('../../../src/storage/sessionStore');
    await updatePresence('user-1', 'online');

    expect(redis.hSet).toHaveBeenCalledWith('gateway:presence', 'user-1', 'online');
  });

  it('returns stored presence', async () => {
    redis.hGet.mockResolvedValueOnce('away');
    const { getPresence } = await import('../../../src/storage/sessionStore');
    const status = await getPresence('user-1');

    expect(status).toBe('away');
  });
});
