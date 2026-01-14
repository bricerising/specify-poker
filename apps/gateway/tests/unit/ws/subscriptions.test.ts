import { describe, it, expect, vi, beforeEach } from "vitest";

const redis = {
  sAdd: vi.fn(),
  sRem: vi.fn(),
  sMembers: vi.fn(),
  del: vi.fn(),
};

vi.mock("../../../src/storage/redisClient", () => ({
  getRedisClient: () => redis,
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

describe("WS subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds and removes subscriptions", async () => {
    const { subscribeToChannel, unsubscribeFromChannel } = await import("../../../src/ws/subscriptions");
    await subscribeToChannel("conn-1", "table:t1");
    await unsubscribeFromChannel("conn-1", "table:t1");

    expect(redis.sAdd).toHaveBeenCalledWith("gateway:subscriptions:table:t1", "conn-1");
    expect(redis.sRem).toHaveBeenCalledWith("gateway:subscriptions:table:t1", "conn-1");
  });

  it("unsubscribes from all channels", async () => {
    redis.sMembers.mockResolvedValueOnce(["table:t1", "chat:t1"]);
    const { unsubscribeAll } = await import("../../../src/ws/subscriptions");
    await unsubscribeAll("conn-1");

    expect(redis.sRem).toHaveBeenCalledWith("gateway:subscriptions:table:t1", "conn-1");
    expect(redis.sRem).toHaveBeenCalledWith("gateway:subscriptions:chat:t1", "conn-1");
    expect(redis.del).toHaveBeenCalledWith("conn_subs:conn-1");
  });

  it("gets subscribers for a channel", async () => {
    redis.sMembers.mockResolvedValueOnce(["conn-1", "conn-2"]);
    const { getSubscribers } = await import("../../../src/ws/subscriptions");
    const subscribers = await getSubscribers("table:t1");

    expect(subscribers).toEqual(["conn-1", "conn-2"]);
  });
});
