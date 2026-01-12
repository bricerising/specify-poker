import { eventStore, GameEvent } from '../storage/eventStore';

export class EventIngestionService {
  async ingestEvent(event: Omit<GameEvent, 'event_id' | 'timestamp' | 'sequence'>): Promise<GameEvent> {
    // Add validation logic here if needed
    if (!event.type) {
      throw new Error('Event type is required');
    }
    if (!event.table_id) {
      throw new Error('Table ID is required');
    }

    return await eventStore.publishEvent(event);
  }

  async ingestEvents(events: Omit<GameEvent, 'event_id' | 'timestamp' | 'sequence'>[]): Promise<GameEvent[]> {
    const results: GameEvent[] = [];
    for (const event of events) {
      results.push(await this.ingestEvent(event));
    }
    return results;
  }
}

export const eventIngestionService = new EventIngestionService();
