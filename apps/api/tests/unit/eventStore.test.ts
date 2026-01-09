import { describe, expect, it } from "vitest";

import { createInMemoryEventStore } from "../../src/services/eventStore";

describe("event store", () => {
  it("appends and lists events", () => {
    const store = createInMemoryEventStore();
    const event = {
      eventId: "event-1",
      handId: "hand-1",
      type: "HandStarted",
      payload: { seed: 1 },
      ts: new Date().toISOString(),
    };

    store.append(event);
    const events = store.list("hand-1");

    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe("event-1");
  });
});
