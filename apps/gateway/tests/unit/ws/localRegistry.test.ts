import { describe, it, expect, vi } from "vitest";
import WebSocket from "ws";
import {
  registerLocalSocket,
  unregisterLocalSocket,
  getLocalSocket,
  getLocalConnectionMeta,
  sendToLocal,
} from "../../../src/ws/localRegistry";

describe("Local registry", () => {
  it("stores and retrieves local sockets", () => {
    const socket = { readyState: WebSocket.OPEN } as WebSocket;
    registerLocalSocket("conn-1", socket, { userId: "user-1", ip: "1.1.1.1" });

    expect(getLocalSocket("conn-1")).toBe(socket);
    expect(getLocalConnectionMeta("conn-1")).toEqual({ socket, userId: "user-1", ip: "1.1.1.1" });

    unregisterLocalSocket("conn-1");
    expect(getLocalSocket("conn-1")).toBeUndefined();
  });

  it("sends to open sockets", () => {
    const send = vi.fn();
    const socket = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
    registerLocalSocket("conn-2", socket, { userId: "user-2", ip: "2.2.2.2" });

    const ok = sendToLocal("conn-2", { type: "Ping" });

    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "Ping" }));
  });
});
