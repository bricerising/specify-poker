import pool from './pgClient';
import redisClient from './redisClient';
import { v4 as uuidv4 } from 'uuid';

export interface GameEvent {
  event_id: string;
  type: string;
  table_id: string;
  hand_id?: string;
  user_id?: string;
  seat_id?: number;
  payload: any;
  timestamp: Date;
  sequence?: number;
}

export class EventStore {
  async publishEvent(event: Omit<GameEvent, 'event_id' | 'timestamp' | 'sequence'>): Promise<GameEvent> {
    const event_id = uuidv4();
    const timestamp = new Date();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `INSERT INTO game_events (event_id, type, table_id, hand_id, user_id, seat_id, payload, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING sequence`,
        [event_id, event.type, event.table_id, event.hand_id, event.user_id, event.seat_id, event.payload, timestamp]
      );

      const sequence = res.rows[0].sequence;
      const fullEvent: GameEvent = { ...event, event_id, timestamp, sequence };

      // Publish to Redis stream for hot streaming
      // Stream key: events:table:{table_id}
      await redisClient.xAdd(`events:table:${event.table_id}`, '*', {
        data: JSON.stringify(fullEvent)
      });

      // Also publish to global stream
      await redisClient.xAdd('events:all', '*', {
        data: JSON.stringify(fullEvent)
      });

      await client.query('COMMIT');
      return fullEvent;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async queryEvents(filters: {
    table_id?: string;
    hand_id?: string;
    user_id?: string;
    types?: string[];
    start_time?: Date;
    end_time?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: GameEvent[]; total: number }> {
    let queryText = 'SELECT * FROM game_events WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (filters.table_id) {
      queryText += ` AND table_id = $${paramCount++}`;
      params.push(filters.table_id);
    }
    if (filters.hand_id) {
      queryText += ` AND hand_id = $${paramCount++}`;
      params.push(filters.hand_id);
    }
    if (filters.user_id) {
      queryText += ` AND user_id = $${paramCount++}`;
      params.push(filters.user_id);
    }
    if (filters.types && filters.types.length > 0) {
      queryText += ` AND type = ANY($${paramCount++})`;
      params.push(filters.types);
    }
    if (filters.start_time) {
      queryText += ` AND timestamp >= $${paramCount++}`;
      params.push(filters.start_time);
    }
    if (filters.end_time) {
      queryText += ` AND timestamp <= $${paramCount++}`;
      params.push(filters.end_time);
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM (${queryText}) as filtered`, params);
    const total = parseInt(countRes.rows[0].count);

    queryText += ` ORDER BY sequence ASC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(filters.limit || 100, filters.offset || 0);

    const res = await pool.query(queryText, params);
    return { events: res.rows, total };
  }

  async getEventById(event_id: string): Promise<GameEvent | null> {
    const res = await pool.query('SELECT * FROM game_events WHERE event_id = $1', [event_id]);
    return res.rows[0] || null;
  }
}

export const eventStore = new EventStore();
