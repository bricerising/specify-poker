import { getRedisClient } from "./redisClient";

const mutedByTable = new Map<string, Set<string>>();

function getMutedKey(tableId: string) {
  return `poker:muted:${tableId}`;
}

export async function muteUser(tableId: string, userId: string) {
  const muted = mutedByTable.get(tableId) ?? new Set<string>();
  muted.add(userId);
  mutedByTable.set(tableId, muted);
  const redis = await getRedisClient();
  if (redis) {
    await redis.sAdd(getMutedKey(tableId), userId);
  }
  return muted;
}

export async function isUserMuted(tableId: string, userId: string) {
  const cached = mutedByTable.get(tableId);
  if (cached) {
    return cached.has(userId);
  }
  const redis = await getRedisClient();
  if (!redis) {
    return false;
  }
  const members = await redis.sMembers(getMutedKey(tableId));
  const muted = new Set(members);
  mutedByTable.set(tableId, muted);
  return muted.has(userId);
}

export async function resetModeration() {
  mutedByTable.clear();
  const redis = await getRedisClient();
  if (redis) {
    const keys = await redis.keys("poker:muted:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
}
