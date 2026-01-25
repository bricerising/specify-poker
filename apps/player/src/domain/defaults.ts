import { Profile, Statistics, UserPreferences } from "./types";

export const defaultPreferences: UserPreferences = {
  soundEnabled: true,
  chatEnabled: true,
  showHandStrength: true,
  theme: "auto",
};

export function defaultProfile(userId: string, nickname: string, now: Date, username = ""): Profile {
  const timestamp = now.toISOString();
  return {
    userId,
    username,
    nickname,
    avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(userId)}`,
    preferences: { ...defaultPreferences },
    lastLoginAt: timestamp,
    referredBy: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

export function defaultStatistics(userId: string, now: Date): Statistics {
  return {
    userId,
    handsPlayed: 0,
    wins: 0,
    vpip: 0,
    pfr: 0,
    allInCount: 0,
    biggestPot: 0,
    referralCount: 0,
    lastUpdated: now.toISOString(),
  };
}
