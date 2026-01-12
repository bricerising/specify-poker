import { eventStore } from "../storage/eventStore";
import { EventQuery, EventQueryResult, GameEvent } from "../domain/types";
import { recordQueryDuration } from "../observability/metrics";

function encodeCursor(offset: number): string {
  return Buffer.from(offset.toString(), "utf8").toString("base64");
}

function decodeCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  const value = parseInt(decoded, 10);
  return Number.isNaN(value) ? 0 : value;
}

export class EventQueryService {
  async queryEvents(query: EventQuery): Promise<EventQueryResult> {
    const start = Date.now();
    const offset = query.cursor ? decodeCursor(query.cursor) : query.offset || 0;
    const limit = query.limit || 100;

    try {
      const result = await eventStore.queryEvents({
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
      recordQueryDuration("ok", Date.now() - start);
      return {
        events: result.events,
        total: result.total,
        hasMore,
        nextCursor: hasMore ? encodeCursor(offset + result.events.length) : undefined,
      };
    } catch (err) {
      recordQueryDuration("error", Date.now() - start);
      throw err;
    }
  }

  async getEvent(eventId: string): Promise<GameEvent | null> {
    return eventStore.getEventById(eventId);
  }
}

export const eventQueryService = new EventQueryService();
