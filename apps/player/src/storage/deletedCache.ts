import { getRedisClient } from "./redisClient";

const DELETED_TTL_SECONDS = 30 * 24 * 60 * 60;

function deletedKey(userId: string): string {
  return `player:deleted:${userId}`;
}

export async function markDeleted(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.set(deletedKey(userId), "1", { EX: DELETED_TTL_SECONDS });
}

export async function isDeleted(userId: string): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) {
    return false;
  }
  const value = await redis.get(deletedKey(userId));
  return value === "1";
}

export async function clearDeleted(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.del(deletedKey(userId));
}
