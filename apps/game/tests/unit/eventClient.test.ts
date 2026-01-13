import { describe, expect, it, vi } from "vitest";

const eventState = vi.hoisted(() => ({
  publishError: null as Error | null,
  publishEventsError: null as Error | null,
  lastPublishRequest: null as unknown,
  lastBatchRequest: null as unknown,
}));

const fakeClient = {
  PublishEvent: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    eventState.lastPublishRequest = request;
    if (eventState.publishError) {
      callback(eventState.publishError, {} as unknown);
      return;
    }
    callback(null, { success: true, event_id: "evt-1" });
  }),
  PublishEvents: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    eventState.lastBatchRequest = request;
    if (eventState.publishEventsError) {
      callback(eventState.publishEventsError, {} as unknown);
      return;
    }
    callback(null, { success: true, event_ids: ["evt-1", "evt-2"] });
  }),
};

vi.mock("@grpc/grpc-js", () => ({
  credentials: { createInsecure: () => ({}) },
  loadPackageDefinition: () => ({
    event: {
      EventService: class {
        constructor() {
          return fakeClient;
        }
      },
    },
  }),
}));

vi.mock("@grpc/proto-loader", () => ({
  loadSync: () => ({}),
}));

vi.mock("../../src/observability/logger", () => ({
  default: { error: vi.fn() },
}));

describe("event client", () => {
  it("publishes events with structured payloads", async () => {
    const client = await import("../../src/clients/eventClient");

    const result = await client.publishEvent({
      type: "TABLE_CREATED",
      tableId: "table-1",
      payload: { nested: { value: 1 }, list: [1, "two"] },
      idempotencyKey: "event-1",
    });

    expect(result.success).toBe(true);
    expect(result.eventId).toBe("evt-1");
    expect(eventState.lastPublishRequest).toBeTruthy();

    const batch = await client.publishEvents([
      {
        type: "ACTION_TAKEN",
        tableId: "table-1",
        payload: { action: "CALL" },
        idempotencyKey: "event-2",
      },
      {
        type: "HAND_STARTED",
        tableId: "table-1",
        payload: { participants: [] },
        idempotencyKey: "event-3",
      },
    ]);

    expect(batch.success).toBe(true);
    expect(batch.eventIds).toEqual(["evt-1", "evt-2"]);
  });

  it("returns failure when publish calls error", async () => {
    const client = await import("../../src/clients/eventClient");
    eventState.publishError = new Error("fail");
    eventState.publishEventsError = new Error("fail");

    const result = await client.publishEvent({
      type: "TABLE_CREATED",
      tableId: "table-1",
      payload: {},
      idempotencyKey: "event-1",
    });
    expect(result.success).toBe(false);

    const batch = await client.publishEvents([
      {
        type: "HAND_STARTED",
        tableId: "table-1",
        payload: {},
        idempotencyKey: "event-2",
      },
    ]);
    expect(batch.success).toBe(false);
  });

  it("exposes convenience helpers for common events", async () => {
    const client = await import("../../src/clients/eventClient");

    await client.emitTableCreated("table-1", "owner-1", "Main Table", { blinds: 1 });
    await client.emitPlayerJoined("table-1", "player-1", 0, 200);
    await client.emitPlayerLeft("table-1", "player-1", 0, 150);
    await client.emitHandStarted("table-1", "hand-1", [], 0);
    await client.emitActionTaken("table-1", "hand-1", "player-1", 0, "CALL", 2, "PREFLOP");
    await client.emitHandCompleted("table-1", "hand-1", [], [], 0);

    expect(eventState.lastPublishRequest).toBeTruthy();
  });
});
