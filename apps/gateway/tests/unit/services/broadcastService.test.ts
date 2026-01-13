import { describe, it, expect, vi, beforeEach } from "vitest";
import { broadcastToChannel } from "../../../src/services/broadcastService";

vi.mock("../../../src/ws/subscriptions", () => ({
  getSubscribers: vi.fn(),
}));

vi.mock("../../../src/ws/localRegistry", () => ({
  sendToLocal: vi.fn(),
}));

vi.mock("../../../src/ws/pubsub", () => ({
  publishTableEvent: vi.fn(),
  publishChatEvent: vi.fn(),
  publishLobbyEvent: vi.fn(),
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import { getSubscribers } from "../../../src/ws/subscriptions";
import { sendToLocal } from "../../../src/ws/localRegistry";
import { publishTableEvent, publishChatEvent, publishLobbyEvent } from "../../../src/ws/pubsub";
import logger from "../../../src/observability/logger";

describe("Broadcast service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("broadcasts table updates locally and via pubsub", async () => {
    vi.mocked(getSubscribers).mockResolvedValue(["conn-1", "conn-2"]);
    await broadcastToChannel("table:t1", { type: "TablePatch", tableId: "t1" });

    expect(sendToLocal).toHaveBeenCalledWith("conn-1", { type: "TablePatch", tableId: "t1" });
    expect(sendToLocal).toHaveBeenCalledWith("conn-2", { type: "TablePatch", tableId: "t1" });
    expect(publishTableEvent).toHaveBeenCalledWith("t1", { type: "TablePatch", tableId: "t1" });
  });

  it("broadcasts chat updates locally and via pubsub", async () => {
    vi.mocked(getSubscribers).mockResolvedValue(["conn-1"]);
    await broadcastToChannel("chat:t2", { type: "ChatMessage", tableId: "t2" });

    expect(sendToLocal).toHaveBeenCalledWith("conn-1", { type: "ChatMessage", tableId: "t2" });
    expect(publishChatEvent).toHaveBeenCalledWith("t2", { type: "ChatMessage", tableId: "t2" });
  });

  it("broadcasts lobby updates with table payloads", async () => {
    vi.mocked(getSubscribers).mockResolvedValue(["conn-1"]);
    const tables = [{ table_id: "t1" }];
    await broadcastToChannel("lobby", { type: "LobbyTablesUpdated", tables });

    expect(sendToLocal).toHaveBeenCalledWith("conn-1", { type: "LobbyTablesUpdated", tables });
    expect(publishLobbyEvent).toHaveBeenCalledWith(tables);
  });

  it("logs broadcast errors when delivery fails", async () => {
    vi.mocked(getSubscribers).mockRejectedValue(new Error("redis down"));

    await broadcastToChannel("table:t1", { type: "TablePatch" });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "table:t1" }),
      "Failed to broadcast to channel"
    );
  });

  it("no-ops when sending to user without implementation", async () => {
    const { sendToUser } = await import("../../../src/services/broadcastService");
    await expect(sendToUser("user-1", { type: "Ping" })).resolves.toBeUndefined();
  });
});
