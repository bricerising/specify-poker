import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage } from "../../../src/storage/chatStore";

const redis = {
  lPush: vi.fn(),
  lTrim: vi.fn(),
  pExpire: vi.fn(),
  lRange: vi.fn(),
};

vi.mock("../../../src/storage/redisClient", () => ({
  getRedisClient: () => redis,
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

describe("Chat store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores chat messages with retention", async () => {
    const { saveChatMessage } = await import("../../../src/storage/chatStore");
    const message: ChatMessage = {
      id: "m1",
      userId: "user-1",
      nickname: "User",
      text: "hello",
      ts: "now",
    };

    await saveChatMessage("table-1", message);

    expect(redis.lPush).toHaveBeenCalledWith("gateway:chat:history:table-1", JSON.stringify(message));
    expect(redis.lTrim).toHaveBeenCalledWith("gateway:chat:history:table-1", 0, 99);
    expect(redis.pExpire).toHaveBeenCalled();
  });

  it("returns chat history in chronological order", async () => {
    redis.lRange.mockResolvedValueOnce([
      JSON.stringify({ id: "m2" }),
      JSON.stringify({ id: "m1" }),
    ]);
    const { getChatHistory } = await import("../../../src/storage/chatStore");
    const history = await getChatHistory("table-1");

    expect(history).toEqual([{ id: "m1" }, { id: "m2" }]);
  });
});
