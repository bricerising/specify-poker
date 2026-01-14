import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import WebSocket from "ws";
import { attachLobbyHub, handleLobbyPubSubEvent } from "../../../src/ws/handlers/lobby";

vi.mock("../../../src/grpc/clients", () => ({
  gameClient: {
    ListTables: vi.fn(),
  },
}));

vi.mock("../../../src/ws/subscriptions", () => ({
  subscribeToChannel: vi.fn(),
  unsubscribeFromChannel: vi.fn(),
  getSubscribers: vi.fn(),
}));

vi.mock("../../../src/ws/localRegistry", () => ({
  sendToLocal: vi.fn(),
}));

vi.mock("../../../src/services/broadcastService", () => ({
  broadcastToChannel: vi.fn(),
}));

import { gameClient } from "../../../src/grpc/clients";
import { subscribeToChannel, getSubscribers } from "../../../src/ws/subscriptions";
import { sendToLocal } from "../../../src/ws/localRegistry";

class MockSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("Lobby WS handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes and sends initial lobby snapshot", async () => {
    vi.mocked(gameClient.ListTables).mockImplementation((_req, callback) => {
      callback(null, { tables: [{ table_id: "t1" }] });
    });
    const socket = new MockSocket();
    await attachLobbyHub(socket as unknown as WebSocket, "conn-1");
    await flushPromises();

    expect(subscribeToChannel).toHaveBeenCalledWith("conn-1", "lobby");
    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "LobbyTablesUpdated", tables: [{ table_id: "t1" }] })
    );
  });

  it("relays lobby pubsub updates to subscribers", async () => {
    vi.mocked(getSubscribers).mockResolvedValue(["conn-1", "conn-2"]);
    await handleLobbyPubSubEvent({
      channel: "lobby",
      tableId: "lobby",
      payload: { tables: [{ table_id: "t1" }] },
      sourceId: "other",
    });

    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ type: "LobbyTablesUpdated", tables: [{ table_id: "t1" }] })
    );
    expect(sendToLocal).toHaveBeenCalledWith(
      "conn-2",
      expect.objectContaining({ type: "LobbyTablesUpdated", tables: [{ table_id: "t1" }] })
    );
  });
});
