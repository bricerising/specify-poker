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
    const requiresHandId = event.type ? HAND_EVENT_TYPES.has(event.type) : false;
    const validations: Array<[boolean, string]> = [
      [Boolean(event.type), "Event type is required"],
      [Boolean(event.tableId), "Table ID is required"],
      [Boolean(event.payload && typeof event.payload === "object"), "Payload must be an object"],
      [!requiresHandId || Boolean(event.handId), `handId is required for event type ${event.type}`],
    ];

    for (const [isValid, message] of validations) {
      if (!isValid) {
        throw new Error(message);
      }
    }
  }
}

export const eventIngestionService = new EventIngestionService();
