import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import type { GameEvent, NewGameEvent } from '../domain/types';
import logger from '../observability/logger';
import { withPgTransaction } from './pgTransaction';
import pool from './pgClient';
import redisClient from './redisClient';
import { streamStore } from './streamStore';

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
    type: row.type as GameEvent['type'],
    tableId: row.table_id,
    handId: row.hand_id,
    userId: row.user_id,
    seatId: row.seat_id,
    payload: row.payload as GameEvent['payload'],
    timestamp: row.timestamp,
    sequence: row.sequence ?? null,
  };
}

type PersistedEvent = {
  event: GameEvent;
  isNew: boolean;
};

type HandSequenceStore = {
  next(handId: string): Promise<number>;
};

class RedisHandSequenceStore implements HandSequenceStore {
  constructor(private readonly redis: Pick<typeof redisClient, 'incr'>) {}

  async next(handId: string): Promise<number> {
    return this.redis.incr(`event:hands:sequence:${handId}`);
  }
}

type EventPersistence = {
  persistEvent(event: NewGameEvent): Promise<PersistedEvent>;
  queryEvents(filters: {
    tableId?: string;
    handId?: string;
    userId?: string;
    types?: string[];
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: GameEvent[]; total: number }>;
  getEventById(eventId: string): Promise<GameEvent | null>;
  getShowdownReveals(handId: string): Promise<Set<number>>;
};

class PgEventPersistence implements EventPersistence {
  constructor(
    private readonly deps: {
      pool: typeof pool;
      handSequenceStore: HandSequenceStore;
    },
  ) {}

  async persistEvent(event: NewGameEvent): Promise<PersistedEvent> {
    return withPgTransaction(
      this.deps.pool,
      async (client) => {
        const existingEvent = await this.findIdempotentEvent(client, event.idempotencyKey);
        if (existingEvent) {
          return { event: existingEvent, isNew: false };
        }

        const eventId = uuidv4();
        const timestamp = new Date();

        const sequence = event.handId
          ? await this.deps.handSequenceStore.next(event.handId)
          : null;

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
          ],
        );

        if (event.idempotencyKey) {
          await client.query(
            `INSERT INTO event_idempotency (idempotency_key, event_id)
             VALUES ($1, $2)`,
            [event.idempotencyKey, eventId],
          );
        }

        return {
          event: {
            eventId,
            type: event.type,
            tableId: event.tableId,
            handId: event.handId ?? null,
            userId: event.userId ?? null,
            seatId: event.seatId ?? null,
            payload: event.payload,
            timestamp,
            sequence,
          },
          isNew: true,
        };
      },
      { logger, name: 'EventStore.publishEvent' },
    );
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
    const { text: whereText, params } = buildEventsWhereClause(filters);

    const countRes = await this.deps.pool.query(
      `SELECT COUNT(*) FROM (SELECT 1 FROM events ${whereText}) as filtered`,
      params,
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const pagingParams = [...params, limit, offset];
    const res = await this.deps.pool.query(
      `SELECT * FROM events ${whereText} ORDER BY timestamp ASC, sequence ASC LIMIT $${
        pagingParams.length - 1
      } OFFSET $${pagingParams.length}`,
      pagingParams,
    );

    return { events: res.rows.map(mapRowToEvent), total };
  }

  async getEventById(eventId: string): Promise<GameEvent | null> {
    const res = await this.deps.pool.query('SELECT * FROM events WHERE event_id = $1', [eventId]);
    return res.rows[0] ? mapRowToEvent(res.rows[0]) : null;
  }

  async getShowdownReveals(handId: string): Promise<Set<number>> {
    const res = await this.deps.pool.query(
      'SELECT payload FROM events WHERE hand_id = $1 AND type = $2 ORDER BY timestamp DESC LIMIT 1',
      [handId, 'SHOWDOWN'],
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
        .filter((seatId): seatId is number => typeof seatId === 'number'),
    );
  }

  private async findIdempotentEvent(
    client: PoolClient,
    idempotencyKey?: string | null,
  ): Promise<GameEvent | null> {
    if (!idempotencyKey) {
      return null;
    }
    const existing = await client.query(
      'SELECT event_id FROM event_idempotency WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    if (!existing.rows[0]) {
      return null;
    }
    const existingEvent = await client.query('SELECT * FROM events WHERE event_id = $1', [
      existing.rows[0].event_id,
    ]);
    if (!existingEvent.rows[0]) {
      throw new Error('Idempotency key exists but event is missing');
    }
    return mapRowToEvent(existingEvent.rows[0]);
  }
}

type StreamPublisher = {
  publishEvent(event: GameEvent): Promise<void>;
};

class RedisStreamPublisher implements StreamPublisher {
  constructor(private readonly deps: { streamStore: Pick<typeof streamStore, 'publishEvent'> }) {}

  publishEvent(event: GameEvent): Promise<void> {
    return this.deps.streamStore.publishEvent(event);
  }
}

export type EventStoreDependencies = {
  persistence: EventPersistence;
  streams: StreamPublisher;
};

function createDefaultEventStoreDependencies(): EventStoreDependencies {
  const handSequenceStore = new RedisHandSequenceStore(redisClient);
  const persistence = new PgEventPersistence({ pool, handSequenceStore });
  const streams = new RedisStreamPublisher({ streamStore });
  return { persistence, streams };
}

export class EventStore {
  constructor(private readonly deps: EventStoreDependencies = createDefaultEventStoreDependencies()) {}

  async publishEvent(event: NewGameEvent): Promise<GameEvent> {
    const persisted = await this.deps.persistence.persistEvent(event);

    if (persisted.isNew) {
      // Fire-and-forget stream publishing; the DB is the source of truth.
      void this.deps.streams.publishEvent(persisted.event).catch((err) => {
        logger.error({ err }, 'Failed to publish event to streams');
      });
    }

    return persisted.event;
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
    return this.deps.persistence.queryEvents(filters);
  }

  async getEventById(eventId: string): Promise<GameEvent | null> {
    return this.deps.persistence.getEventById(eventId);
  }

  async getShowdownReveals(handId: string): Promise<Set<number>> {
    return this.deps.persistence.getShowdownReveals(handId);
  }
}

export const eventStore = new EventStore();

function buildEventsWhereClause(filters: {
  tableId?: string;
  handId?: string;
  userId?: string;
  types?: string[];
  startTime?: Date;
  endTime?: Date;
}): { text: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const add = (clause: string, value: unknown) => {
    if (value === undefined || value === null) {
      return;
    }
    params.push(value);
    conditions.push(`${clause} $${params.length}`);
  };

  add('table_id =', filters.tableId);
  add('hand_id =', filters.handId);
  add('user_id =', filters.userId);
  if (filters.types && filters.types.length > 0) {
    params.push(filters.types);
    conditions.push(`type = ANY($${params.length})`);
  }
  add('timestamp >=', filters.startTime);
  add('timestamp <=', filters.endTime);

  if (conditions.length === 0) {
    return { text: '', params };
  }
  return { text: `WHERE ${conditions.join(' AND ')}`, params };
}
