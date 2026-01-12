import { eventStore, GameEvent } from '../storage/eventStore';

export interface EventFilter {
  table_id?: string;
  hand_id?: string;
  user_id?: string;
  types?: string[];
  start_time?: Date;
  end_time?: Date;
  limit?: number;
  offset?: number;
}

export class EventQueryService {
  async queryEvents(filter: EventFilter): Promise<{ events: GameEvent[]; total: number }> {
    return await eventStore.queryEvents(filter);
  }

  async getEvent(eventId: string): Promise<GameEvent | null> {
    return await eventStore.getEventById(eventId);
  }
}

export const eventQueryService = new EventQueryService();
