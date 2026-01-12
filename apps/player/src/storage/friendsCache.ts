import { getRedisClient } from "./redisClient";

const FRIENDS_TTL_SECONDS = 300;

function friendsKey(userId: string): string {
  return `player:friends:${userId}`;
}

export async function get(userId: string): Promise<string[] | null> {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }
  const data = await redis.sMembers(friendsKey(userId));
  if (data.length === 0) {
    return null;
  }
  return data;
}

export async function set(userId: string, friendIds: string[]): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  const key = friendsKey(userId);
  if (friendIds.length === 0) {
    await redis.del(key);
    return;
  }
  await redis.del(key);
  await redis.sAdd(key, friendIds);
  await redis.expire(key, FRIENDS_TTL_SECONDS);
}

export async function add(userId: string, friendId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  const key = friendsKey(userId);
  await redis.sAdd(key, friendId);
  await redis.expire(key, FRIENDS_TTL_SECONDS);
}

export async function remove(userId: string, friendId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  const key = friendsKey(userId);
  await redis.sRem(key, friendId);
  await redis.expire(key, FRIENDS_TTL_SECONDS);
}

export async function invalidate(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.del(friendsKey(userId));
}
