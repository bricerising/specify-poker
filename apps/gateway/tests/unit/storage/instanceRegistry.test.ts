import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const redis = {
  hSet: vi.fn(),
  hGetAll: vi.fn(),
  hDel: vi.fn(),
};

vi.mock("../../../src/storage/redisClient", () => ({
  getRedisClient: () => redis,
}));

vi.mock("../../../src/ws/pubsub", () => ({
  getWsInstanceId: () => "instance-1",
}));

const clearInstanceConnections = vi.fn();
vi.mock("../../../src/storage/connectionStore", () => ({
  clearInstanceConnections: (...args: unknown[]) => clearInstanceConnections(...args),
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Instance registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers instance and starts heartbeat", async () => {
    redis.hGetAll.mockResolvedValueOnce({});
    const { registerInstance } = await import("../../../src/storage/instanceRegistry");

    await registerInstance();

    expect(redis.hSet).toHaveBeenCalledWith("gateway:instances", "instance-1", expect.any(String));
    vi.advanceTimersByTime(10000);
    expect(redis.hSet).toHaveBeenCalledTimes(2);
  });

  it("cleans up stale instances", async () => {
    const now = 100000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    redis.hGetAll.mockResolvedValueOnce({
      "old-instance": String(now - 40000),
      "fresh-instance": String(now - 1000),
    });
    const { cleanupStaleInstances } = await import("../../../src/storage/instanceRegistry");

    await cleanupStaleInstances();

    expect(clearInstanceConnections).toHaveBeenCalledWith("old-instance");
    expect(redis.hDel).toHaveBeenCalledWith("gateway:instances", "old-instance");
    expect(redis.hDel).not.toHaveBeenCalledWith("gateway:instances", "fresh-instance");
  });
});
