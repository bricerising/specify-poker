import { getFriends } from "./friendsService";
import { getRedisClient } from "./redisClient";

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
const PROFILES_KEY = "poker:profiles";

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

async function ensureProfile(
  userId: string,
  defaults?: { nickname?: string; avatarUrl?: string | null },
) {
  const existing = profiles.get(userId);
  if (existing) {
    return existing;
  }
  const redis = await getRedisClient();
  if (redis) {
    const payload = await redis.hGet(PROFILES_KEY, userId);
    if (payload) {
      const stored = JSON.parse(payload) as StoredProfile;
      profiles.set(userId, stored);
      return stored;
    }
  }
  const created = createDefaultProfile(userId, defaults);
  profiles.set(userId, created);
  if (redis) {
    await redis.hSet(PROFILES_KEY, userId, JSON.stringify(created));
  }
  return created;
}

export async function getProfile(
  userId: string,
  defaults?: { nickname?: string; avatarUrl?: string | null },
): Promise<UserProfile> {
  const stored = await ensureProfile(userId, defaults);
  const friends = await getFriends(userId);
  return {
    userId,
    nickname: stored.nickname,
    avatarUrl: stored.avatarUrl,
    stats: { ...stored.stats },
    friends,
  };
}

export async function updateProfile(
  userId: string,
  updates: { nickname?: string; avatarUrl?: string | null },
  defaults?: { nickname?: string; avatarUrl?: string | null },
) {
  const stored = await ensureProfile(userId, defaults);
  if (typeof updates.nickname === "string") {
    stored.nickname = updates.nickname;
  }
  if (updates.avatarUrl !== undefined) {
    stored.avatarUrl = updates.avatarUrl;
  }
  profiles.set(userId, stored);
  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(PROFILES_KEY, userId, JSON.stringify(stored));
  }
  return getProfile(userId);
}

export async function recordHandStats(userId: string, outcome: { played: boolean; won: boolean }) {
  const stored = await ensureProfile(userId);
  if (outcome.played) {
    stored.stats.handsPlayed += 1;
  }
  if (outcome.won) {
    stored.stats.wins += 1;
  }
  profiles.set(userId, stored);
  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(PROFILES_KEY, userId, JSON.stringify(stored));
  }
}

export async function resetProfiles() {
  profiles.clear();
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(PROFILES_KEY);
  }
}
