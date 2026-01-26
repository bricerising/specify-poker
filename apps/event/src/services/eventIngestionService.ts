import { eventStore } from "../storage/eventStore";
import { EventType, isEventType, NewGameEvent } from "../domain/types";
import { recordIngestion } from "../observability/metrics";
import { InvalidArgumentError, isRecord } from "../errors";

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
      throw new InvalidArgumentError("Event type is required");
    }
    if (!isEventType(event.type)) {
      throw new InvalidArgumentError(`Unknown event type: ${event.type}`);
    }

    const requiresHandId = HAND_EVENT_TYPES.has(event.type);
    const validations: Array<[boolean, string]> = [
      [typeof event.tableId === "string" && event.tableId.trim().length > 0, "Table ID is required"],
      [isRecord(event.payload), "Payload must be an object"],
      [
        !requiresHandId || (typeof event.handId === "string" && event.handId.trim().length > 0),
        `handId is required for event type ${event.type}`,
      ],
    ];

    for (const [isValid, message] of validations) {
      if (!isValid) {
        throw new InvalidArgumentError(message);
      }
    }
  }
}

export const eventIngestionService = new EventIngestionService();
