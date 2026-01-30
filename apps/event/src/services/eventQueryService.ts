import { eventStore } from '../storage/eventStore';
import type { EventQuery, EventQueryResult, GameEvent } from '../domain/types';
import { recordQueryDuration } from '../observability/metrics';

function encodeCursor(offset: number): string {
  return Buffer.from(offset.toString(), 'utf8').toString('base64');
}

function decodeCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  const value = parseInt(decoded, 10);
  return Number.isNaN(value) ? 0 : value;
}

export type EventQueryServiceDependencies = {
  eventStore: Pick<typeof eventStore, 'queryEvents' | 'getEventById'>;
  recordQueryDuration: typeof recordQueryDuration;
};

export class EventQueryService {
  constructor(
    private readonly deps: EventQueryServiceDependencies = { eventStore, recordQueryDuration },
  ) {}

  async queryEvents(query: EventQuery): Promise<EventQueryResult> {
    const start = Date.now();
    const offset = query.cursor ? decodeCursor(query.cursor) : (query.offset ?? 0);
    const limit = query.limit ?? 100;
    let status: 'ok' | 'error' = 'ok';

    try {
      const result = await this.deps.eventStore.queryEvents({
        tableId: query.tableId,
        handId: query.handId,
        userId: query.userId,
        types: query.types,
        startTime: query.startTime,
        endTime: query.endTime,
        limit,
        offset,
      });

      const hasMore = result.total > offset + result.events.length;
      return {
        events: result.events,
        total: result.total,
        hasMore,
        nextCursor: hasMore ? encodeCursor(offset + result.events.length) : undefined,
      };
    } catch (err) {
      status = 'error';
      throw err;
    } finally {
      this.deps.recordQueryDuration(status, Date.now() - start);
    }
  }

  async getEvent(eventId: string): Promise<GameEvent | null> {
    return this.deps.eventStore.getEventById(eventId);
  }
}

export const eventQueryService = new EventQueryService();
