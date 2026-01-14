import { describe, it, expect, beforeEach, vi } from "vitest";

const connect = vi.fn();
const quit = vi.fn();
const on = vi.fn();

vi.mock("redis", () => ({
  createClient: vi.fn(() => ({
    connect,
    quit,
    on,
  })),
}));

vi.mock("../../src/observability/logger", () => ({
  default: {
    warn: vi.fn(),
  },
}));

describe("redis client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    connect.mockResolvedValue(undefined);
  });

  it("returns null when redis is disabled", async () => {
    vi.doMock("../../src/config", () => ({
      getConfig: () => ({
        redisUrl: null,
      }),
    }));
    const redisClient = await import("../../src/storage/redisClient");

    const client = await redisClient.getRedisClient();

    expect(client).toBeNull();
  });

  it("connects and reuses a redis client when enabled", async () => {
    vi.doMock("../../src/config", () => ({
      getConfig: () => ({
        redisUrl: "redis://localhost:6379",
      }),
    }));
    const redisClient = await import("../../src/storage/redisClient");

    const first = await redisClient.getRedisClient();
    const second = await redisClient.getRedisClient();

    expect(first).toBe(second);
  });

  it("closes the redis client", async () => {
    vi.doMock("../../src/config", () => ({
      getConfig: () => ({
        redisUrl: "redis://localhost:6379",
      }),
    }));
    const redisClient = await import("../../src/storage/redisClient");

    await redisClient.getRedisClient();
    await redisClient.closeRedisClient();

    expect(quit).toHaveBeenCalled();
  });
});
