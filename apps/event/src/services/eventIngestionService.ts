import { eventStore } from "../storage/eventStore";
import { EventType, NewGameEvent } from "../domain/types";
import { recordIngestion } from "../observability/metrics";

const HAND_EVENT_TYPES = new Set<EventType>([
  "HAND_STARTED",
  "CARDS_DEALT",
  "BLIND_POSTED",
  "ACTION_TAKEN",
  "STREET_ADVANCED",
  "CARDS_REVEALED",
  "SHOWDOWN",
  "POT_AWARDED",
  "HAND_COMPLETED",
  "TURN_STARTED",
  "RAKE_DEDUCTED",
]);

export class EventIngestionService {
  async ingestEvent(event: NewGameEvent): Promise<ReturnType<typeof eventStore.publishEvent>> {
    this.validateEvent(event);
    const result = await eventStore.publishEvent(event);
    recordIngestion(event.type);
    return result;
  }

  async ingestEvents(events: NewGameEvent[]): Promise<ReturnType<typeof eventStore.publishEvents>> {
    for (const event of events) {
      this.validateEvent(event);
    }
    const results = await eventStore.publishEvents(events);
    events.forEach((event) => recordIngestion(event.type));
    return results;
  }

  private validateEvent(event: NewGameEvent): void {
    if (!event.type) {
      throw new Error("Event type is required");
    }
    if (!event.tableId) {
      throw new Error("Table ID is required");
    }
    if (!event.payload || typeof event.payload !== "object") {
      throw new Error("Payload must be an object");
    }
    if (HAND_EVENT_TYPES.has(event.type) && !event.handId) {
      throw new Error(`handId is required for event type ${event.type}`);
    }
  }
}

export const eventIngestionService = new EventIngestionService();
