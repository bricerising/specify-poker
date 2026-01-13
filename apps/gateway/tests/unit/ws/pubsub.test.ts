import { describe, it, expect, vi, beforeEach } from "vitest";

const subscribeHandlers: Record<string, (message: string) => void> = {};

const subClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  subscribe: vi.fn((channel: string, handler: (message: string) => void) => {
    subscribeHandlers[channel] = handler;
  }),
};

const pubClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  publish: vi.fn().mockResolvedValue(1),
  duplicate: vi.fn(() => subClient),
};

vi.mock("redis", () => ({
  createClient: vi.fn(() => pubClient),
}));

vi.mock("../../../src/config", () => ({
  getConfig: () => ({ redisUrl: "redis://localhost:6379" }),
}));

vi.mock("crypto", () => ({
  randomUUID: () => "instance-1",
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("WS pubsub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(subscribeHandlers).forEach((key) => delete subscribeHandlers[key]);
    vi.resetModules();
  });

  it("routes pubsub messages to handlers", async () => {
    const { initWsPubSub } = await import("../../../src/ws/pubsub");
    const handlers = {
      onTableEvent: vi.fn(),
      onChatEvent: vi.fn(),
      onTimerEvent: vi.fn(),
      onLobbyEvent: vi.fn(),
    };

    await initWsPubSub(handlers);

    const handler = subscribeHandlers["gateway:ws:events"];
    expect(handler).toBeDefined();

    handler(
      JSON.stringify({
        channel: "table",
        tableId: "t1",
        payload: { type: "TablePatch" },
        sourceId: "other",
      })
    );

    expect(handlers.onTableEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: "t1" })
    );
  });

  it("ignores messages from the same instance", async () => {
    const { initWsPubSub } = await import("../../../src/ws/pubsub");
    const handlers = {
      onTableEvent: vi.fn(),
      onChatEvent: vi.fn(),
      onTimerEvent: vi.fn(),
      onLobbyEvent: vi.fn(),
    };

    await initWsPubSub(handlers);
    const handler = subscribeHandlers["gateway:ws:events"];

    handler(
      JSON.stringify({
        channel: "chat",
        tableId: "t1",
        payload: { type: "ChatMessage" },
        sourceId: "instance-1",
      })
    );

    expect(handlers.onChatEvent).not.toHaveBeenCalled();
  });

  it("publishes table events with instance id", async () => {
    const { initWsPubSub, publishTableEvent } = await import("../../../src/ws/pubsub");
    await initWsPubSub({
      onTableEvent: vi.fn(),
      onChatEvent: vi.fn(),
      onTimerEvent: vi.fn(),
      onLobbyEvent: vi.fn(),
    });

    await publishTableEvent("t1", { type: "TablePatch" });

    expect(pubClient.publish).toHaveBeenCalledWith(
      "gateway:ws:events",
      expect.stringContaining("\"sourceId\":\"instance-1\"")
    );
  });
});
