import { describe, it, expect, beforeEach, vi } from "vitest";
import * as profileService from "../../src/services/profileService";
import * as profileRepository from "../../src/storage/profileRepository";
import * as profileCache from "../../src/storage/profileCache";
import * as deletedCache from "../../src/storage/deletedCache";
import * as nicknameService from "../../src/services/nicknameService";
import * as statisticsService from "../../src/services/statisticsService";
import * as eventProducer from "../../src/services/eventProducer";

vi.mock("../../src/storage/profileRepository");
vi.mock("../../src/storage/profileCache");
vi.mock("../../src/storage/deletedCache");
vi.mock("../../src/services/nicknameService");
vi.mock("../../src/services/statisticsService");
vi.mock("../../src/services/eventProducer");

describe("profileService", () => {
  const baseProfile = {
    userId: "user123",
    nickname: "Player123",
    avatarUrl: null,
    preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: "auto" },
    lastLoginAt: "2024-01-01T00:00:00Z",
    referredBy: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached profile when available", async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(baseProfile);

    const profile = await profileService.getProfile("user123");

    expect(profile.userId).toBe("user123");
    expect(profileCache.get).toHaveBeenCalledWith("user123");
  });

  it("updates nickname and invalidates old nickname", async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(baseProfile);
    vi.mocked(nicknameService.validateNickname).mockImplementation(() => undefined);
    vi.mocked(nicknameService.isAvailable).mockResolvedValue(true);
    vi.mocked(profileRepository.update).mockResolvedValue({
      ...baseProfile,
      nickname: "NewNick",
      updatedAt: "2024-02-01T00:00:00Z",
    });

    const updated = await profileService.updateProfile("user123", { nickname: "NewNick" });

    expect(updated.nickname).toBe("NewNick");
    expect(profileCache.deleteNickname).toHaveBeenCalledWith("Player123");
  });

  it("tracks referrals on creation", async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(null);
    vi.mocked(profileRepository.findById).mockResolvedValue(null);
    vi.mocked(nicknameService.generateNickname).mockResolvedValue("PlayerRef");
    vi.mocked(profileRepository.create).mockResolvedValue({
      ...baseProfile,
      nickname: "PlayerRef",
      referredBy: "referrer",
    });

    await profileService.getProfile("user123", "referrer");

    expect(statisticsService.incrementReferralCount).toHaveBeenCalledWith("referrer", 1);
    expect(eventProducer.publishEvent).toHaveBeenCalled();
  });
});
