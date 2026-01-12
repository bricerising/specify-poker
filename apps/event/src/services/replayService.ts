import { eventStore, GameEvent } from '../storage/eventStore';

export class ReplayService {
  async getHandEvents(handId: string): Promise<GameEvent[]> {
    const result = await eventStore.queryEvents({ hand_id: handId, limit: 1000 });
    return result.events;
  }

  // Future: Implement state reconstruction logic here
  // async reconstructStateAt(handId: string, eventId: string): Promise<GameState> { ... }
}

export const replayService = new ReplayService();
