export interface HandEvent {
  eventId: string;
  handId: string;
  type: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface EventStore {
  append(event: HandEvent): void;
  list(handId: string): HandEvent[];
}

class InMemoryEventStore implements EventStore {
  private readonly eventsByHand = new Map<string, HandEvent[]>();

  append(event: HandEvent) {
    const list = this.eventsByHand.get(event.handId) ?? [];
    list.push(event);
    this.eventsByHand.set(event.handId, list);
    console.log("event_store.append", {
      handId: event.handId,
      eventId: event.eventId,
      type: event.type,
    });
  }

  list(handId: string) {
    return [...(this.eventsByHand.get(handId) ?? [])];
  }

  reset() {
    this.eventsByHand.clear();
  }
}

export function createInMemoryEventStore() {
  return new InMemoryEventStore();
}

export const eventStore = createInMemoryEventStore();

export function resetEventStore() {
  eventStore.reset();
}
