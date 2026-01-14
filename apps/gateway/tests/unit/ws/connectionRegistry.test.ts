import { describe, it, expect, vi } from "vitest";
import WebSocket from "ws";
import { registerConnection, unregisterConnection } from "../../../src/ws/connectionRegistry";

vi.mock("../../../src/storage/connectionStore", () => ({
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
}));

vi.mock("../../../src/ws/localRegistry", () => ({
  registerLocalSocket: vi.fn(),
  unregisterLocalSocket: vi.fn(),
}));

vi.mock("../../../src/ws/pubsub", () => ({
  getWsInstanceId: () => "instance-1",
}));

import { saveConnection, deleteConnection } from "../../../src/storage/connectionStore";
import { registerLocalSocket, unregisterLocalSocket } from "../../../src/ws/localRegistry";

describe("Connection registry", () => {
  it("registers and unregisters connections", async () => {
    const socket = {} as WebSocket;
    await registerConnection(
      { connectionId: "conn-1", userId: "user-1", connectedAt: "now", ip: "1.1.1.1" },
      socket
    );

    expect(saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-1", instanceId: "instance-1" })
    );
    expect(registerLocalSocket).toHaveBeenCalledWith("conn-1", socket, {
      userId: "user-1",
      ip: "1.1.1.1",
    });

    await unregisterConnection("conn-1", "user-1");
    expect(deleteConnection).toHaveBeenCalledWith("conn-1", "user-1");
    expect(unregisterLocalSocket).toHaveBeenCalledWith("conn-1");
  });
});
