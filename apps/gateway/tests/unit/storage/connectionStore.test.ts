import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionInfo } from '../../../src/storage/connectionStore';

const redis = {
  hSet: vi.fn(),
  sAdd: vi.fn(),
  hDel: vi.fn(),
  sRem: vi.fn(),
  hGet: vi.fn(),
  sMembers: vi.fn(),
  hGetAll: vi.fn(),
};

vi.mock('../../../src/storage/redisClient', () => ({
  getRedisClient: () => redis,
  withRedisClient: async <T>(
    operation: (client: typeof redis) => Promise<T>,
    options: { fallback: T; logMessage: string; context?: Record<string, unknown> },
  ) => {
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
    info: vi.fn(),
  },
}));

describe('Connection store', () => {
  const info: ConnectionInfo = {
    connectionId: 'conn-1',
    userId: 'user-1',
    connectedAt: 'now',
    instanceId: 'inst-1',
    ip: '1.1.1.1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves and deletes connections', async () => {
    const { saveConnection, deleteConnection } =
      await import('../../../src/storage/connectionStore');

    await saveConnection(info);
    expect(redis.hSet).toHaveBeenCalledWith(
      'gateway:connections',
      info.connectionId,
      JSON.stringify(info),
    );
    expect(redis.sAdd).toHaveBeenCalledWith('gateway:user_connections:user-1', info.connectionId);

    await deleteConnection(info.connectionId, info.userId);
    expect(redis.hDel).toHaveBeenCalledWith('gateway:connections', info.connectionId);
    expect(redis.sRem).toHaveBeenCalledWith('gateway:user_connections:user-1', info.connectionId);
  });

  it('gets connections by id and user', async () => {
    redis.hGet.mockResolvedValueOnce(JSON.stringify(info));
    redis.sMembers.mockResolvedValueOnce(['conn-1', 'conn-2']);
    const { getConnection, getConnectionsByUser } =
      await import('../../../src/storage/connectionStore');

    const stored = await getConnection('conn-1');
    const list = await getConnectionsByUser('user-1');

    expect(stored).toEqual(info);
    expect(list).toEqual(['conn-1', 'conn-2']);
  });

  it('clears stale connections for an instance', async () => {
    redis.hGetAll.mockResolvedValueOnce({
      'conn-1': JSON.stringify({ ...info, instanceId: 'inst-1' }),
      'conn-2': JSON.stringify({ ...info, connectionId: 'conn-2', instanceId: 'inst-2' }),
    });
    const { clearInstanceConnections } = await import('../../../src/storage/connectionStore');

    await clearInstanceConnections('inst-1');

    expect(redis.hDel).toHaveBeenCalledWith('gateway:connections', 'conn-1');
    expect(redis.sRem).toHaveBeenCalledWith('gateway:user_connections:user-1', 'conn-1');
    expect(redis.hDel).not.toHaveBeenCalledWith('gateway:connections', 'conn-2');
  });
});
