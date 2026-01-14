import pool from "./pgClient";
import redisClient from "./redisClient";
import { Cursor } from "../domain/types";

const cursorKey = (cursorId: string) => `event:cursors:${cursorId}`;
const subscriberKey = (subscriberId: string) => `event:cursors:by-subscriber:${subscriberId}`;

function mapRowToCursor(row: {
  cursor_id: string;
  stream_id: string;
  subscriber_id: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}): Cursor {
  return {
    cursorId: row.cursor_id,
    streamId: row.stream_id,
    subscriberId: row.subscriber_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export class CursorStore {
  async getCursor(streamId: string, subscriberId: string): Promise<Cursor | null> {
    const cursorId = `${streamId}:${subscriberId}`;
    const cached = await redisClient.get(cursorKey(cursorId));
    if (cached) {
      return hydrateCursor(JSON.parse(cached) as Cursor);
    }

    const res = await pool.query("SELECT * FROM cursors WHERE stream_id = $1 AND subscriber_id = $2", [
      streamId,
      subscriberId,
    ]);
    if (!res.rows[0]) {
      return null;
    }
    const cursor = mapRowToCursor(res.rows[0]);
    await redisClient.set(cursorKey(cursorId), JSON.stringify(cursor));
    await redisClient.sAdd(subscriberKey(subscriberId), cursorId);
    return cursor;
  }

  async upsertCursor(streamId: string, subscriberId: string, position: number): Promise<Cursor> {
    const cursorId = `${streamId}:${subscriberId}`;
    const res = await pool.query(
      `INSERT INTO cursors (cursor_id, stream_id, subscriber_id, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (stream_id, subscriber_id)
       DO UPDATE SET position = EXCLUDED.position, updated_at = NOW()
       RETURNING *`,
      [cursorId, streamId, subscriberId, position]
    );

    const cursor = mapRowToCursor(res.rows[0]);
    await redisClient.set(cursorKey(cursorId), JSON.stringify(cursor));
    await redisClient.sAdd(subscriberKey(subscriberId), cursorId);
    return cursor;
  }

  async deleteCursor(streamId: string, subscriberId: string): Promise<void> {
    const cursorId = `${streamId}:${subscriberId}`;
    await pool.query("DELETE FROM cursors WHERE stream_id = $1 AND subscriber_id = $2", [
      streamId,
      subscriberId,
    ]);
    await redisClient.del(cursorKey(cursorId));
    await redisClient.sRem(subscriberKey(subscriberId), cursorId);
  }

  async findBySubscriber(subscriberId: string): Promise<Cursor[]> {
    const res = await pool.query("SELECT * FROM cursors WHERE subscriber_id = $1", [subscriberId]);
    return res.rows.map(mapRowToCursor);
  }
}

export const cursorStore = new CursorStore();
