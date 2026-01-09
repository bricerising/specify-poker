import { getFriends } from "./friendsService";

export interface UserStats {
  handsPlayed: number;
  wins: number;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  stats: UserStats;
  friends: string[];
}

interface StoredProfile {
  nickname: string;
  avatarUrl: string | null;
  stats: UserStats;
}

const profiles = new Map<string, StoredProfile>();

function createDefaultProfile(userId: string, defaults?: { nickname?: string; avatarUrl?: string | null }) {
  return {
    nickname: defaults?.nickname ?? userId,
    avatarUrl: defaults?.avatarUrl ?? null,
    stats: {
      handsPlayed: 0,
      wins: 0,
    },
  };
}

function ensureProfile(userId: string, defaults?: { nickname?: string; avatarUrl?: string | null }) {
  const existing = profiles.get(userId);
  if (existing) {
    return existing;
  }
  const created = createDefaultProfile(userId, defaults);
  profiles.set(userId, created);
  return created;
}

export function getProfile(userId: string, defaults?: { nickname?: string; avatarUrl?: string | null }): UserProfile {
  const stored = ensureProfile(userId, defaults);
  return {
    userId,
    nickname: stored.nickname,
    avatarUrl: stored.avatarUrl,
    stats: { ...stored.stats },
    friends: getFriends(userId),
  };
}

export function updateProfile(
  userId: string,
  updates: { nickname?: string; avatarUrl?: string | null },
  defaults?: { nickname?: string; avatarUrl?: string | null },
) {
  const stored = ensureProfile(userId, defaults);
  if (typeof updates.nickname === "string") {
    stored.nickname = updates.nickname;
  }
  if (updates.avatarUrl !== undefined) {
    stored.avatarUrl = updates.avatarUrl;
  }
  profiles.set(userId, stored);
  return getProfile(userId);
}

export function recordHandStats(userId: string, outcome: { played: boolean; won: boolean }) {
  const stored = ensureProfile(userId);
  if (outcome.played) {
    stored.stats.handsPlayed += 1;
  }
  if (outcome.won) {
    stored.stats.wins += 1;
  }
  profiles.set(userId, stored);
}

export function resetProfiles() {
  profiles.clear();
}
