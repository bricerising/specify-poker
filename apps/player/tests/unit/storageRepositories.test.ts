import { describe, it, expect, beforeEach, vi } from "vitest";
import * as profileRepository from "../../src/storage/profileRepository";
import * as friendsRepository from "../../src/storage/friendsRepository";
import * as statisticsRepository from "../../src/storage/statisticsRepository";
import { query } from "../../src/storage/db";

vi.mock("../../src/storage/db", () => ({
  query: vi.fn(),
}));

describe("storage repositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps profiles and defaults preferences", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          user_id: "user-1",
          username: "user-1",
          nickname: "Nick",
          avatar_url: null,
          preferences: { soundEnabled: false },
          last_login_at: null,
          referred_by: null,
          created_at: new Date("2024-01-01T00:00:00Z"),
          updated_at: new Date("2024-01-01T00:00:00Z"),
          deleted_at: null,
        },
      ],
    } as never);

    const profile = await profileRepository.findById("user-1");

    expect(profile?.preferences.soundEnabled).toBe(false);
    expect(profile?.preferences.chatEnabled).toBe(true);
  });

  it("creates and updates profiles via SQL", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
        {
          user_id: "user-1",
          username: "user-1",
          nickname: "Nick",
          avatar_url: null,
          preferences: {},
          last_login_at: null,
          referred_by: null,
            created_at: new Date("2024-01-01T00:00:00Z"),
            updated_at: new Date("2024-01-01T00:00:00Z"),
            deleted_at: null,
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [
        {
          user_id: "user-1",
          username: "user-1",
          nickname: "Nick2",
          avatar_url: null,
          preferences: {},
          last_login_at: null,
          referred_by: null,
            created_at: new Date("2024-01-01T00:00:00Z"),
            updated_at: new Date("2024-01-01T00:00:00Z"),
            deleted_at: null,
          },
        ],
      } as never);

    const createResult = await profileRepository.create({
      userId: "user-1",
      username: "user-1",
      nickname: "Nick",
      avatarUrl: null,
      preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: "auto" },
      lastLoginAt: null,
      referredBy: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deletedAt: null,
    });

    const updated = await profileRepository.update({ ...createResult.profile, nickname: "Nick2" });

    expect(createResult.profile.userId).toBe("user-1");
    expect(updated.nickname).toBe("Nick2");
  });

  it("finds profiles by nickname when present", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          user_id: "user-2",
          username: "user-2",
          nickname: "Lucky",
          avatar_url: null,
          preferences: {},
          last_login_at: null,
          referred_by: null,
          created_at: new Date("2024-01-01T00:00:00Z"),
          updated_at: new Date("2024-01-01T00:00:00Z"),
          deleted_at: null,
        },
      ],
    } as never);

    const profile = await profileRepository.findByNickname("Lucky");

    expect(profile?.userId).toBe("user-2");
  });

  it("upserts and deletes profiles via SQL", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          user_id: "user-3",
          username: "user-3",
          nickname: "Upserted",
          avatar_url: null,
          preferences: {},
          last_login_at: null,
          referred_by: null,
          created_at: new Date("2024-01-01T00:00:00Z"),
          updated_at: new Date("2024-01-01T00:00:00Z"),
          deleted_at: null,
        },
      ],
    } as never);

    await profileRepository.upsert({
      userId: "user-3",
      username: "user-3",
      nickname: "Upserted",
      avatarUrl: null,
      preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: "auto" },
      lastLoginAt: null,
      referredBy: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deletedAt: null,
    });

    await profileRepository.softDelete("user-3", new Date());
    await profileRepository.touchLogin("user-3", new Date());
    await profileRepository.hardDelete("user-3");

    expect(query).toHaveBeenCalled();
  });

  it("returns empty profile list when no ids are provided", async () => {
    const profiles = await profileRepository.findByIds([]);

    expect(profiles).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns friends list ordered by query results", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ friend_id: "friend-1" }, { friend_id: "friend-2" }],
    } as never);

    const friends = await friendsRepository.getFriends("user-1");

    expect(friends).toEqual(["friend-1", "friend-2"]);
  });

  it("adds and removes friends via SQL calls", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] } as never);

    await friendsRepository.addFriend("user-1", "friend-1");
    await friendsRepository.removeFriend("user-1", "friend-1");
    await friendsRepository.removeAllReferences("user-1");

    expect(query).toHaveBeenCalled();
  });

  it("maps statistics rows from the database", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          user_id: "user-1",
          hands_played: 10,
          wins: 2,
          vpip: "20.0",
          pfr: "10.0",
          all_in_count: 1,
          biggest_pot: 100,
          referral_count: 1,
          last_updated: new Date("2024-01-01T00:00:00Z"),
        },
      ],
    } as never);

    const stats = await statisticsRepository.findById("user-1");

    expect(stats?.vpip).toBe(20);
    expect(stats?.pfr).toBe(10);
  });

  it("updates statistics via SQL", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          user_id: "user-1",
          hands_played: 12,
          wins: 3,
          vpip: "25.0",
          pfr: "12.0",
          all_in_count: 1,
          biggest_pot: 200,
          referral_count: 1,
          last_updated: new Date("2024-01-01T00:00:00Z"),
        },
      ],
    } as never);

    const updated = await statisticsRepository.update({
      userId: "user-1",
      handsPlayed: 12,
      wins: 3,
      vpip: 25,
      pfr: 12,
      allInCount: 1,
      biggestPot: 200,
      referralCount: 1,
      lastUpdated: "2024-01-01T00:00:00Z",
    });

    expect(updated.handsPlayed).toBe(12);
  });

  it("upserts statistics via SQL", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          user_id: "user-4",
          hands_played: 5,
          wins: 1,
          vpip: "15.0",
          pfr: "8.0",
          all_in_count: 0,
          biggest_pot: 40,
          referral_count: 0,
          last_updated: new Date("2024-01-01T00:00:00Z"),
        },
      ],
    } as never);

    const upserted = await statisticsRepository.upsert({
      userId: "user-4",
      handsPlayed: 5,
      wins: 1,
      vpip: 15,
      pfr: 8,
      allInCount: 0,
      biggestPot: 40,
      referralCount: 0,
      lastUpdated: "2024-01-01T00:00:00Z",
    });

    expect(upserted.userId).toBe("user-4");
  });

  it("returns null when statistics rows are missing", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] } as never);

    const stats = await statisticsRepository.findById("user-1");

    expect(stats).toBeNull();
  });
});
