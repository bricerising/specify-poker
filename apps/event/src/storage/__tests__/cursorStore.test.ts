import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CursorStore } from '../cursorStore';
import pool from '../pgClient';
import redisClient from '../redisClient';

vi.mock('../pgClient', () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock('../redisClient', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    sAdd: vi.fn(),
    sRem: vi.fn(),
    del: vi.fn(),
  },
}));

describe('CursorStore', () => {
  const store = new CursorStore();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached cursor when present', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(
      JSON.stringify({
        cursorId: 'table:t1:sub-1',
        streamId: 'table:t1',
        subscriberId: 'sub-1',
        position: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );

    const cursor = await store.getCursor('table:t1', 'sub-1');

    expect(cursor?.position).toBe(5);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('hydrates cursor from database and caches it', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          cursor_id: 'table:t1:sub-1',
          stream_id: 'table:t1',
          subscriber_id: 'sub-1',
          position: 8,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    } as never);

    const cursor = await store.getCursor('table:t1', 'sub-1');

    expect(cursor?.position).toBe(8);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
    expect(redisClient.sAdd).toHaveBeenCalledWith(
      'event:cursors:by-subscriber:sub-1',
      'table:t1:sub-1',
    );
  });

  it('falls back to database when cached cursor is invalid', async () => {
    vi.mocked(redisClient.get).mockResolvedValue('{bad json');
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          cursor_id: 'table:t1:sub-1',
          stream_id: 'table:t1',
          subscriber_id: 'sub-1',
          position: 8,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    } as never);

    const cursor = await store.getCursor('table:t1', 'sub-1');

    expect(cursor?.position).toBe(8);
    expect(redisClient.del).toHaveBeenCalledWith('event:cursors:table:t1:sub-1');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('upserts cursor position', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          cursor_id: 'table:t1:sub-1',
          stream_id: 'table:t1',
          subscriber_id: 'sub-1',
          position: 12,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    } as never);

    const cursor = await store.upsertCursor('table:t1', 'sub-1', 12);

    expect(cursor.position).toBe(12);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
    expect(redisClient.sAdd).toHaveBeenCalledWith(
      'event:cursors:by-subscriber:sub-1',
      'table:t1:sub-1',
    );
  });

  it('deletes cursor and cache', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    await store.deleteCursor('table:t1', 'sub-1');

    expect(redisClient.del).toHaveBeenCalledWith('event:cursors:table:t1:sub-1');
    expect(redisClient.sRem).toHaveBeenCalledWith(
      'event:cursors:by-subscriber:sub-1',
      'table:t1:sub-1',
    );
  });

  it('finds cursors by subscriber', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          cursor_id: 'table:t1:sub-1',
          stream_id: 'table:t1',
          subscriber_id: 'sub-1',
          position: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    } as never);

    const results = await store.findBySubscriber('sub-1');

    expect(results).toHaveLength(1);
    expect(results[0].cursorId).toBe('table:t1:sub-1');
  });
});
