import { describe, it, expect, beforeEach, vi } from "vitest";
import * as profileCache from "../../src/storage/profileCache";
import * as friendsCache from "../../src/storage/friendsCache";
import * as statisticsCache from "../../src/storage/statisticsCache";
import * as deletedCache from "../../src/storage/deletedCache";
import * as redisClient from "../../src/storage/redisClient";

describe("storage caches", () => {
  const redis = {
    get: vi.fn(),
    mGet: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sMembers: vi.fn(),
    sAdd: vi.fn(),
    sRem: vi.fn(),
    expire: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null profile cache when redis is unavailable", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(null);

    const result = await profileCache.get("user-1");

    expect(result).toBeNull();
  });

  it("stores and retrieves profile cache entries", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);
    redis.get.mockResolvedValue(JSON.stringify({ userId: "user-1", nickname: "Nick" }));

    await profileCache.set({
      userId: "user-1",
      nickname: "Nick",
      avatarUrl: null,
      preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: "auto" },
      lastLoginAt: null,
      referredBy: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deletedAt: null,
    });
    const loaded = await profileCache.get("user-1");

    expect(redis.set).toHaveBeenCalled();
    expect(loaded?.nickname).toBe("Nick");
  });

  it("invalidates profile cache entries", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);

    await profileCache.invalidate("user-1");

    expect(redis.del).toHaveBeenCalledWith("player:profiles:user-1");
  });

  it("loads multiple profiles from cache", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);
    redis.mGet.mockResolvedValue([JSON.stringify({ userId: "user-1" }), null]);

    const result = await profileCache.getMulti(["user-1", "user-2"]);

    expect(result.get("user-1")).toEqual({ userId: "user-1" });
    expect(result.has("user-2")).toBe(false);
  });

  it("looks up and deletes nickname keys", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);
    redis.get.mockResolvedValue("user-1");

    const userId = await profileCache.getUserIdByNickname("Nick");
    await profileCache.deleteNickname("Nick");

    expect(userId).toBe("user-1");
    expect(redis.del).toHaveBeenCalled();
  });

  it("handles friends cache set and invalidate", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);

    await friendsCache.set("user-1", ["friend-1"]);
    await friendsCache.invalidate("user-1");

    expect(redis.sAdd).toHaveBeenCalledWith("player:friends:user-1", ["friend-1"]);
    expect(redis.del).toHaveBeenCalledWith("player:friends:user-1");
  });

  it("clears friends cache when empty list is provided", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);

    await friendsCache.set("user-1", []);

    expect(redis.del).toHaveBeenCalledWith("player:friends:user-1");
  });

  it("adds and removes friend cache entries", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);

    await friendsCache.add("user-1", "friend-1");
    await friendsCache.remove("user-1", "friend-1");

    expect(redis.sAdd).toHaveBeenCalledWith("player:friends:user-1", "friend-1");
    expect(redis.sRem).toHaveBeenCalledWith("player:friends:user-1", "friend-1");
  });

  it("returns null when friends cache is empty", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);
    redis.sMembers.mockResolvedValue([]);

    const friends = await friendsCache.get("user-1");

    expect(friends).toBeNull();
  });

  it("returns null when friends cache is unavailable", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(null);

    const friends = await friendsCache.get("user-2");

    expect(friends).toBeNull();
  });

  it("stores and invalidates statistics cache", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);

    await statisticsCache.set({
      userId: "user-1",
      handsPlayed: 1,
      wins: 1,
      vpip: 10,
      pfr: 5,
      allInCount: 0,
      biggestPot: 20,
      referralCount: 0,
      lastUpdated: "2024-01-01T00:00:00Z",
    });
    await statisticsCache.invalidate("user-1");

    expect(redis.set).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith("player:stats:user-1");
  });

  it("returns cached statistics when present", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);
    redis.get.mockResolvedValue(JSON.stringify({ userId: "user-1", handsPlayed: 3 }));

    const stats = await statisticsCache.get("user-1");

    expect(stats).toEqual({ userId: "user-1", handsPlayed: 3 });
  });

  it("returns null when statistics cache is unavailable", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(null);

    const stats = await statisticsCache.get("user-3");

    expect(stats).toBeNull();
  });

  it("marks and clears deleted cache entries", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);
    redis.get.mockResolvedValue("1");

    await deletedCache.markDeleted("user-1");
    const isDeleted = await deletedCache.isDeleted("user-1");
    await deletedCache.clearDeleted("user-1");

    expect(isDeleted).toBe(true);
    expect(redis.del).toHaveBeenCalledWith("player:deleted:user-1");
  });

  it("returns false for deleted cache misses", async () => {
    vi.spyOn(redisClient, "getRedisClient").mockResolvedValue(redis as never);
    redis.get.mockResolvedValue(null);

    const isDeleted = await deletedCache.isDeleted("user-2");

    expect(isDeleted).toBe(false);
  });
});
