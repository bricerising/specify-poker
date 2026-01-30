import pool from './pgClient';
import redisClient from './redisClient';
import type { Cursor } from '../domain/types';
import { safeJsonParseRecord } from '../utils/json';

// Proxy pattern: a small Postgres repository wrapped by a Redis-backed cache.

type CursorRow = {
  cursor_id: string;
  stream_id: string;
  subscriber_id: string;
  position: number;
  created_at: Date;
  updated_at: Date;
};

function hydrateCursor(raw: {
  cursorId: string;
  streamId: string;
  subscriberId: string;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}): Cursor {
  return {
    cursorId: raw.cursorId,
    streamId: raw.streamId,
    subscriberId: raw.subscriberId,
    position: raw.position,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt),
  };
}

function mapRowToCursor(row: CursorRow): Cursor {
  return {
    cursorId: row.cursor_id,
    streamId: row.stream_id,
    subscriberId: row.subscriber_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type PgCursorClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: CursorRow[] }>;
};

type RedisCursorClient = Pick<
  typeof redisClient,
  'get' | 'set' | 'del' | 'sAdd' | 'sRem'
>;

type CursorRepository = {
  getCursor(streamId: string, subscriberId: string): Promise<Cursor | null>;
  upsertCursor(streamId: string, subscriberId: string, position: number): Promise<Cursor>;
  deleteCursor(streamId: string, subscriberId: string): Promise<void>;
  findBySubscriber(subscriberId: string): Promise<Cursor[]>;
};

class PgCursorRepository implements CursorRepository {
  constructor(private readonly pg: PgCursorClient) {}

  async getCursor(streamId: string, subscriberId: string): Promise<Cursor | null> {
    const res = await this.pg.query(
      'SELECT * FROM cursors WHERE stream_id = $1 AND subscriber_id = $2',
      [streamId, subscriberId],
    );
    return res.rows[0] ? mapRowToCursor(res.rows[0]) : null;
  }

  async upsertCursor(streamId: string, subscriberId: string, position: number): Promise<Cursor> {
    const cursorId = `${streamId}:${subscriberId}`;
    const res = await this.pg.query(
      `INSERT INTO cursors (cursor_id, stream_id, subscriber_id, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (stream_id, subscriber_id)
       DO UPDATE SET position = EXCLUDED.position, updated_at = NOW()
       RETURNING *`,
      [cursorId, streamId, subscriberId, position],
    );
    return mapRowToCursor(res.rows[0]);
  }

  async deleteCursor(streamId: string, subscriberId: string): Promise<void> {
    await this.pg.query('DELETE FROM cursors WHERE stream_id = $1 AND subscriber_id = $2', [
      streamId,
      subscriberId,
    ]);
  }

  async findBySubscriber(subscriberId: string): Promise<Cursor[]> {
    const res = await this.pg.query('SELECT * FROM cursors WHERE subscriber_id = $1', [
      subscriberId,
    ]);
    return res.rows.map(mapRowToCursor);
  }
}

type CursorCache = {
  get(cursorId: string): Promise<Cursor | null>;
  set(cursor: Cursor): Promise<void>;
  delete(cursorId: string): Promise<void>;
  addToSubscriberIndex(subscriberId: string, cursorId: string): Promise<void>;
  removeFromSubscriberIndex(subscriberId: string, cursorId: string): Promise<void>;
};

class RedisCursorCache implements CursorCache {
  constructor(private readonly redis: RedisCursorClient) {}

  private cursorKey(cursorId: string): string {
    return `event:cursors:${cursorId}`;
  }

  private subscriberKey(subscriberId: string): string {
    return `event:cursors:by-subscriber:${subscriberId}`;
  }

  async get(cursorId: string): Promise<Cursor | null> {
    const cached = await this.redis.get(this.cursorKey(cursorId));
    if (!cached) {
      return null;
    }

    const parsed = this.parseCachedCursor(cached);
    if (parsed) {
      return parsed;
    }

    // Best-effort eviction to avoid repeatedly decoding bad cache.
    try {
      await this.redis.del(this.cursorKey(cursorId));
    } catch {
      // ignore cache eviction failure and fall back to DB
    }

    return null;
  }

  async set(cursor: Cursor): Promise<void> {
    await this.redis.set(this.cursorKey(cursor.cursorId), JSON.stringify(cursor));
  }

  async delete(cursorId: string): Promise<void> {
    await this.redis.del(this.cursorKey(cursorId));
  }

  async addToSubscriberIndex(subscriberId: string, cursorId: string): Promise<void> {
    await this.redis.sAdd(this.subscriberKey(subscriberId), cursorId);
  }

  async removeFromSubscriberIndex(subscriberId: string, cursorId: string): Promise<void> {
    await this.redis.sRem(this.subscriberKey(subscriberId), cursorId);
  }

  private parseCachedCursor(raw: string): Cursor | null {
    const parsed = safeJsonParseRecord(raw);
    if (!parsed) {
      return null;
    }

    const { cursorId, streamId, subscriberId, position, createdAt, updatedAt } = parsed;

    if (
      typeof cursorId !== 'string' ||
      typeof streamId !== 'string' ||
      typeof subscriberId !== 'string'
    ) {
      return null;
    }
    if (typeof position !== 'number' || !Number.isFinite(position)) {
      return null;
    }
    if (typeof createdAt !== 'string' && !(createdAt instanceof Date)) {
      return null;
    }
    if (typeof updatedAt !== 'string' && !(updatedAt instanceof Date)) {
      return null;
    }

    return hydrateCursor({
      cursorId,
      streamId,
      subscriberId,
      position,
      createdAt,
      updatedAt,
    });
  }
}

export type CursorStoreDependencies = {
  repo: CursorRepository;
  cache: CursorCache;
};

function createDefaultCursorStoreDependencies(): CursorStoreDependencies {
  return {
    repo: new PgCursorRepository(pool),
    cache: new RedisCursorCache(redisClient),
  };
}

export class CursorStore {
  constructor(private readonly deps: CursorStoreDependencies = createDefaultCursorStoreDependencies()) {}

  async getCursor(streamId: string, subscriberId: string): Promise<Cursor | null> {
    const cursorId = `${streamId}:${subscriberId}`;

    const cached = await this.deps.cache.get(cursorId);
    if (cached) {
      return cached;
    }

    const cursor = await this.deps.repo.getCursor(streamId, subscriberId);
    if (!cursor) {
      return null;
    }

    await this.deps.cache.set(cursor);
    await this.deps.cache.addToSubscriberIndex(subscriberId, cursorId);
    return cursor;
  }

  async upsertCursor(streamId: string, subscriberId: string, position: number): Promise<Cursor> {
    const cursor = await this.deps.repo.upsertCursor(streamId, subscriberId, position);
    await this.deps.cache.set(cursor);
    await this.deps.cache.addToSubscriberIndex(subscriberId, cursor.cursorId);
    return cursor;
  }

  async deleteCursor(streamId: string, subscriberId: string): Promise<void> {
    const cursorId = `${streamId}:${subscriberId}`;
    await this.deps.repo.deleteCursor(streamId, subscriberId);
    await this.deps.cache.delete(cursorId);
    await this.deps.cache.removeFromSubscriberIndex(subscriberId, cursorId);
  }

  async findBySubscriber(subscriberId: string): Promise<Cursor[]> {
    return this.deps.repo.findBySubscriber(subscriberId);
  }
}

export const cursorStore = new CursorStore();
