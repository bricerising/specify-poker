import { getRedisClient } from "./redisClient";

const friendsByUser = new Map<string, string[]>();

function getFriendsKey(userId: string) {
  return `poker:friends:${userId}`;
}

export async function getFriends(userId: string) {
  const cached = friendsByUser.get(userId);
  if (cached) {
    return cached;
  }
  const redis = await getRedisClient();
  if (!redis) {
    return [];
  }
  const payload = await redis.get(getFriendsKey(userId));
  if (!payload) {
    return [];
  }
  const parsed = JSON.parse(payload) as string[];
  friendsByUser.set(userId, parsed);
  return parsed;
}

export async function setFriends(userId: string, friends: string[]) {
  const unique = Array.from(new Set(friends));
  friendsByUser.set(userId, unique);
  const redis = await getRedisClient();
  if (redis) {
    await redis.set(getFriendsKey(userId), JSON.stringify(unique));
  }
  return unique;
}

export async function resetFriends() {
  friendsByUser.clear();
  const redis = await getRedisClient();
  if (redis) {
    const keys = await redis.keys("poker:friends:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
}
