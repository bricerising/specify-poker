import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import WebSocket from "ws";
import { attachTableHub, handleTablePubSubEvent } from "../../../src/ws/handlers/table";

vi.mock("../../../src/grpc/clients", () => ({
  gameClient: {
    JoinSpectator: vi.fn(),
    LeaveSpectator: vi.fn(),
    GetTableState: vi.fn(),
    SubmitAction: vi.fn(),
    JoinSeat: vi.fn(),
    LeaveSeat: vi.fn(),
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

import { gameClient } from "../../../src/grpc/clients";
import { subscribeToChannel, unsubscribeFromChannel, getSubscribers } from "../../../src/ws/subscriptions";
import { sendToLocal, getLocalConnectionMeta } from "../../../src/ws/localRegistry";
import { checkWsRateLimit } from "../../../src/ws/validators";

class MockSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("Table WS handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLocalConnectionMeta).mockReturnValue({ ip: "1.2.3.4" } as { ip: string });
    vi.mocked(checkWsRateLimit).mockResolvedValue({ ok: true });
  });

  it("subscribes and sends snapshot on SubscribeTable", async () => {
    const socket = new MockSocket();
    vi.mocked(gameClient.GetTableState).mockImplementation((_req, callback) => {
      callback(null, {
        state: { table_id: "t1", hand: { hand_id: "h1" } },
        hole_cards: ["As", "Kd"],
      });
    });

    attachTableHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "SubscribeTable", tableId: "t1" })));
    await flushPromises();

    expect(subscribeToChannel).toHaveBeenCalledWith("conn-1", "table:t1");
    expect(gameClient.JoinSpectator).toHaveBeenCalledWith(
      { table_id: "t1", user_id: "user-1" },
      expect.any(Function)
    );
    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "TableSnapshot", tableState: { table_id: "t1", hand: { hand_id: "h1" } } })
    );
    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "HoleCards", tableId: "t1", handId: "h1", cards: ["As", "Kd"] })
    );
  });

  it("unsubscribes and notifies spectator leave on UnsubscribeTable", async () => {
    const socket = new MockSocket();
    attachTableHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit("message", Buffer.from(JSON.stringify({ type: "UnsubscribeTable", tableId: "t2" })));
    await flushPromises();

    expect(gameClient.LeaveSpectator).toHaveBeenCalledWith(
      { table_id: "t2", user_id: "user-1" },
      expect.any(Function)
    );
    expect(unsubscribeFromChannel).toHaveBeenCalledWith("conn-1", "table:t2");
  });

  it("rejects invalid actions before hitting the game service", async () => {
    const socket = new MockSocket();
    attachTableHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "Action", tableId: "t1", action: "INVALID" }))
    );
    await flushPromises();

    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ActionResult", accepted: false, reason: "invalid_action" })
    );
    expect(gameClient.SubmitAction).not.toHaveBeenCalled();
  });

  it("rate limits actions at the gateway", async () => {
    vi.mocked(checkWsRateLimit).mockResolvedValue({ ok: false });
    const socket = new MockSocket();
    attachTableHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "Action", tableId: "t1", action: "Fold" }))
    );
    await flushPromises();

    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ActionResult", accepted: false, reason: "rate_limited" })
    );
    expect(gameClient.SubmitAction).not.toHaveBeenCalled();
  });

  it("forwards accepted actions to the game service", async () => {
    vi.mocked(gameClient.SubmitAction).mockImplementation((_req, callback) => {
      callback(null, { ok: true });
    });
    const socket = new MockSocket();
    attachTableHub(socket as unknown as WebSocket, "user-1", "conn-1");
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "Action", tableId: "t1", action: "Fold" }))
    );
    await flushPromises();

    expect(gameClient.SubmitAction).toHaveBeenCalledWith(
      expect.objectContaining({
        table_id: "t1",
        user_id: "user-1",
        action_type: "FOLD",
      }),
      expect.any(Function)
    );
    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "ActionResult", accepted: true })
    );
  });

  it("routes pubsub table updates to local subscribers", async () => {
    vi.mocked(getSubscribers).mockResolvedValue(["conn-1", "conn-2"]);
    await handleTablePubSubEvent({
      channel: "table",
      tableId: "t1",
      payload: { type: "TablePatch", tableId: "t1" },
      sourceId: "other",
    });

    expect(sendToLocal).toHaveBeenCalledWith("conn-1", { type: "TablePatch", tableId: "t1" });
    expect(sendToLocal).toHaveBeenCalledWith("conn-2", { type: "TablePatch", tableId: "t1" });
  });
});
