import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import WebSocket from "ws";
import { attachChatHub } from "../../../src/ws/handlers/chat";

vi.mock("../../../src/grpc/clients", () => ({
  gameClient: {
    GetTableState: vi.fn(),
    IsMuted: vi.fn(),
  },
  playerClient: {
    GetProfile: vi.fn(),
  },
}));

vi.mock("../../../src/ws/subscriptions", () => ({
  subscribeToChannel: vi.fn(),
  unsubscribeFromChannel: vi.fn(),
  unsubscribeAll: vi.fn(),
  getSubscribers: vi.fn(),
}));

vi.mock("../../../src/ws/localRegistry", () => ({
  sendToLocal: vi.fn(),
  getLocalConnectionMeta: vi.fn(),
}));

vi.mock("../../../src/services/broadcastService", () => ({
  broadcastToChannel: vi.fn(),
}));

vi.mock("../../../src/storage/chatStore", () => ({
  saveChatMessage: vi.fn(),
  getChatHistory: vi.fn(),
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("../../../src/ws/validators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/ws/validators")>();
  return {
    ...actual,
    checkWsRateLimit: vi.fn(),
  };
});

import { gameClient, playerClient } from "../../../src/grpc/clients";
import { subscribeToChannel } from "../../../src/ws/subscriptions";
import { sendToLocal, getLocalConnectionMeta } from "../../../src/ws/localRegistry";
import { broadcastToChannel } from "../../../src/services/broadcastService";
import { saveChatMessage, getChatHistory } from "../../../src/storage/chatStore";
import { checkWsRateLimit } from "../../../src/ws/validators";

class MockSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("Chat WS handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLocalConnectionMeta).mockReturnValue({ ip: "1.2.3.4" } as { ip: string });
    vi.mocked(checkWsRateLimit).mockResolvedValue({ ok: true });
  });

  it("subscribes and returns history on SubscribeChat", async () => {
    vi.mocked(getChatHistory).mockResolvedValue([{ id: "m1", text: "hi" }]);
    const socket = new MockSocket();
    attachChatHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "SubscribeChat", tableId: "t1" })));
    await flushPromises();

    expect(subscribeToChannel).toHaveBeenCalledWith("conn-1", "chat:t1");
    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ChatSubscribed", tableId: "t1", history: [{ id: "m1", text: "hi" }] })
    );
  });

  it("rejects empty chat messages", async () => {
    const socket = new MockSocket();
    attachChatHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "ChatSend", tableId: "t1", message: "" })));
    await flushPromises();

    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ChatError", tableId: "t1", reason: "empty_message" })
    );
  });

  it("rate limits chat messages at the gateway", async () => {
    vi.mocked(checkWsRateLimit).mockResolvedValue({ ok: false });
    const socket = new MockSocket();
    attachChatHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "ChatSend", tableId: "t1", message: "hello" })));
    await flushPromises();

    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ChatError", tableId: "t1", reason: "rate_limited" })
    );
  });

  it("rejects chat from users not seated or spectating", async () => {
    vi.mocked(gameClient.GetTableState).mockImplementation((_req, callback) => {
      callback(null, { state: { seats: [], spectators: [] } });
    });
    const socket = new MockSocket();
    attachChatHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "ChatSend", tableId: "t1", message: "hello" })));
    await flushPromises();

    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ChatError", tableId: "t1", reason: "not_seated" })
    );
  });

  it("rejects muted users", async () => {
    vi.mocked(gameClient.GetTableState).mockImplementation((_req, callback) => {
      callback(null, { state: { seats: [{ user_id: "user-1", status: "active" }], spectators: [] } });
    });
    vi.mocked(gameClient.IsMuted).mockImplementation((_req, callback) => {
      callback(null, { is_muted: true });
    });
    const socket = new MockSocket();
    attachChatHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "ChatSend", tableId: "t1", message: "hello" })));
    await flushPromises();

    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ChatError", tableId: "t1", reason: "muted" })
    );
  });

  it("broadcasts chat messages for spectators", async () => {
    vi.mocked(gameClient.GetTableState).mockImplementation((_req, callback) => {
      callback(null, { state: { seats: [], spectators: [{ user_id: "user-1", status: "active" }] } });
    });
    vi.mocked(gameClient.IsMuted).mockImplementation((_req, callback) => {
      callback(null, { is_muted: false });
    });
    vi.mocked(playerClient.GetProfile).mockImplementation((_req, callback) => {
      callback(null, { profile: { username: "SpecUser" } });
    });
    const socket = new MockSocket();
    attachChatHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "ChatSend", tableId: "t1", message: "hello" })));
    await flushPromises();

    expect(saveChatMessage).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ text: "hello", username: "SpecUser", userId: "user-1" })
    );
    expect(broadcastToChannel).toHaveBeenCalledWith(
      "chat:t1",
      expect.objectContaining({
        type: "ChatMessage",
        tableId: "t1",
        message: expect.objectContaining({ text: "hello", username: "SpecUser" }),
      })
    );
  });
});
