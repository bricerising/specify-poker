"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const eventStore_1 = require("../../src/services/eventStore");
(0, vitest_1.describe)("event store", () => {
    (0, vitest_1.it)("appends and lists events", () => {
        const store = (0, eventStore_1.createInMemoryEventStore)();
        const event = {
            eventId: "event-1",
            handId: "hand-1",
            type: "HandStarted",
            payload: { seed: 1 },
            ts: new Date().toISOString(),
        };
        store.append(event);
        const events = store.list("hand-1");
        (0, vitest_1.expect)(events).toHaveLength(1);
        (0, vitest_1.expect)(events[0].eventId).toBe("event-1");
    });
});
