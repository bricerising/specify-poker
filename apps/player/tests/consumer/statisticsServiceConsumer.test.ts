import { describe, it, expect, beforeEach, vi } from "vitest";
import * as statisticsService from "../../src/services/statisticsService";
import * as statisticsRepository from "../../src/storage/statisticsRepository";
import * as statisticsCache from "../../src/storage/statisticsCache";
import * as profileRepository from "../../src/storage/profileRepository";
import * as profileCache from "../../src/storage/profileCache";
import * as nicknameService from "../../src/services/nicknameService";

vi.mock("../../src/storage/statisticsRepository");
vi.mock("../../src/storage/statisticsCache");
vi.mock("../../src/storage/profileRepository");
vi.mock("../../src/storage/profileCache");
vi.mock("../../src/services/nicknameService");

describe("statisticsService consumer behavior", () => {
  const baseStats = {
    userId: "user-1",
    handsPlayed: 10,
    wins: 2,
    vpip: 20,
    pfr: 10,
    allInCount: 0,
    biggestPot: 50,
    referralCount: 1,
    lastUpdated: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached statistics for profile views", async () => {
    vi.mocked(statisticsCache.get).mockResolvedValue(baseStats);

    const stats = await statisticsService.getStatistics("user-1");

    expect(stats).toEqual(baseStats);
    expect(statisticsRepository.findById).not.toHaveBeenCalled();
  });

  it("auto-creates statistics with a default profile when missing", async () => {
    vi.mocked(statisticsCache.get).mockResolvedValue(null);
    vi.mocked(statisticsRepository.findById).mockResolvedValue(null);
    vi.mocked(profileRepository.findById).mockResolvedValue(null);
    vi.mocked(nicknameService.generateNickname).mockResolvedValue("PlayerAuto");
    vi.mocked(profileRepository.create).mockResolvedValue({
      userId: "user-2",
      nickname: "PlayerAuto",
      avatarUrl: null,
      preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: "auto" },
      lastLoginAt: "2024-01-01T00:00:00Z",
      referredBy: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deletedAt: null,
    });
    vi.mocked(statisticsRepository.upsert).mockImplementation(async (stats) => ({
      ...stats,
      lastUpdated: "2024-01-01T00:00:00Z",
    }));

    const stats = await statisticsService.getStatistics("user-2");

    expect(profileRepository.create).toHaveBeenCalled();
    expect(profileCache.set).toHaveBeenCalled();
    expect(statisticsRepository.upsert).toHaveBeenCalled();
    expect(stats.userId).toBe("user-2");
  });

  it("clamps and floors increment values to keep stats consumer-friendly", async () => {
    vi.mocked(statisticsCache.get).mockResolvedValue(baseStats);
    vi.mocked(statisticsRepository.update).mockImplementation(async (stats) => stats);

    const updated = await statisticsService.incrementStatistic(
      "user-1",
      statisticsService.StatisticType.Vpip,
      1000
    );

    expect(updated.vpip).toBe(100);

    const winsUpdated = await statisticsService.incrementStatistic(
      "user-1",
      statisticsService.StatisticType.Wins,
      -5
    );

    expect(winsUpdated.wins).toBe(baseStats.wins);

    const potUpdated = await statisticsService.incrementStatistic(
      "user-1",
      statisticsService.StatisticType.BiggestPot,
      120
    );

    expect(potUpdated.biggestPot).toBe(120);
  });
});
