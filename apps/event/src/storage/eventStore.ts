import pool from "./pgClient";
import redisClient from "./redisClient";
import { v4 as uuidv4 } from "uuid";
import { GameEvent, NewGameEvent } from "../domain/types";
import { streamStore } from "./streamStore";
import logger from "../observability/logger";

interface EventRow {
  event_id: string;
  type: string;
  table_id: string;
  hand_id: string | null;
  user_id: string | null;
  seat_id: number | null;
  payload: unknown;
  timestamp: Date;
  sequence: number | null;
}

function mapRowToEvent(row: EventRow): GameEvent {
  return {
    eventId: row.event_id,
    type: row.type as GameEvent["type"],
    tableId: row.table_id,
    handId: row.hand_id,
    userId: row.user_id,
    seatId: row.seat_id,
    payload: row.payload as GameEvent["payload"],
    timestamp: row.timestamp,
    sequence: row.sequence ?? null,
  };
}

async function nextSequenceForHand(handId: string): Promise<number> {
  return redisClient.incr(`event:hands:sequence:${handId}`);
}

export class EventStore {
  async publishEvent(event: NewGameEvent): Promise<GameEvent> {
    const eventId = uuidv4();
    const timestamp = new Date();
    const sequence = event.handId ? await nextSequenceForHand(event.handId) : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingEvent = await this.findIdempotentEvent(client, event.idempotencyKey);
      if (existingEvent) {
        await client.query("COMMIT");
        return existingEvent;
      }

      await client.query(
        `INSERT INTO events (event_id, type, table_id, hand_id, user_id, seat_id, payload, timestamp, sequence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          eventId,
          event.type,
          event.tableId,
          event.handId ?? null,
          event.userId ?? null,
          event.seatId ?? null,
          event.payload,
          timestamp,
          sequence,
        ]
      );

      if (event.idempotencyKey) {
        await client.query(
          `INSERT INTO event_idempotency (idempotency_key, event_id)
           VALUES ($1, $2)`,
          [event.idempotencyKey, eventId]
        );
      }

      await client.query("COMMIT");

      const storedEvent = {
        eventId,
        type: event.type,
        tableId: event.tableId,
        handId: event.handId ?? null,
        userId: event.userId ?? null,
        seatId: event.seatId ?? null,
        payload: event.payload,
        timestamp,
        sequence,
      };

      try {
        await streamStore.publishEvent(storedEvent);
      } catch (err) {
        logger.error({ err }, "Failed to publish event to streams");
      }

      return storedEvent;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async publishEvents(events: NewGameEvent[]): Promise<GameEvent[]> {
    const results: GameEvent[] = [];
    for (const event of events) {
      results.push(await this.publishEvent(event));
    }
    return results;
  }

  async queryEvents(filters: {
    tableId?: string;
    handId?: string;
    userId?: string;
    types?: string[];
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: GameEvent[]; total: number }> {
    let queryText = "SELECT * FROM events WHERE 1=1";
    const params: unknown[] = [];
    let paramCount = 1;

    const addFilter = (value: unknown, clause: string) => {
      if (value === undefined || value === null) {
        return;
      }
      queryText += ` ${clause} $${paramCount++}`;
      params.push(value);
    };

    addFilter(filters.tableId, "AND table_id =");
    addFilter(filters.handId, "AND hand_id =");
    addFilter(filters.userId, "AND user_id =");
    if (filters.types && filters.types.length > 0) {
      queryText += ` AND type = ANY($${paramCount++})`;
      params.push(filters.types);
    }
    addFilter(filters.startTime, "AND timestamp >=");
    addFilter(filters.endTime, "AND timestamp <=");

    const countRes = await pool.query(`SELECT COUNT(*) FROM (${queryText}) as filtered`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    queryText += ` ORDER BY timestamp ASC, sequence ASC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(filters.limit || 100, filters.offset || 0);

    const res = await pool.query(queryText, params);
    return { events: res.rows.map(mapRowToEvent), total };
  }

  async getEventById(eventId: string): Promise<GameEvent | null> {
    const res = await pool.query("SELECT * FROM events WHERE event_id = $1", [eventId]);
    return res.rows[0] ? mapRowToEvent(res.rows[0]) : null;
  }

  async getShowdownReveals(handId: string): Promise<Set<number>> {
    const res = await pool.query(
      "SELECT payload FROM events WHERE hand_id = $1 AND type = $2 ORDER BY timestamp DESC LIMIT 1",
      [handId, "SHOWDOWN"]
    );
    const row = res.rows[0];
    if (!row) {
      return new Set();
    }
    const payload = row.payload as {
      reveals?: { seatId?: number; seat_id?: number }[];
    };
    return new Set(
      (payload.reveals || [])
        .map((reveal) => reveal.seatId ?? reveal.seat_id)
        .filter((seatId): seatId is number => typeof seatId === "number")
    );
  }

  private async findIdempotentEvent(
    client: Awaited<ReturnType<typeof pool.connect>>,
    idempotencyKey?: string | null
  ): Promise<GameEvent | null> {
    if (!idempotencyKey) {
      return null;
    }
    const existing = await client.query(
      "SELECT event_id FROM event_idempotency WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    if (!existing.rows[0]) {
      return null;
    }
    const existingEvent = await client.query("SELECT * FROM events WHERE event_id = $1", [
      existing.rows[0].event_id,
    ]);
    if (!existingEvent.rows[0]) {
      throw new Error("Idempotency key exists but event is missing");
    }
    return mapRowToEvent(existingEvent.rows[0]);
  }
}

export const eventStore = new EventStore();
