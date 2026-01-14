import { getRedisClient } from "./redisClient";
import logger from "../observability/logger";

const PRESENCE_KEY = "gateway:presence";

export type UserStatus = "online" | "away" | "offline";

export async function updatePresence(userId: string, status: UserStatus) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    if (status === "offline") {
      await redis.hDel(PRESENCE_KEY, userId);
    } else {
      await redis.hSet(PRESENCE_KEY, userId, status);
    }
  } catch (err) {
    logger.error({ err, userId }, "Failed to update presence in Redis");
  }
}

export async function getPresence(userId: string): Promise<UserStatus> {
  const redis = await getRedisClient();
  if (!redis) return "offline";

  try {
    const status = await redis.hGet(PRESENCE_KEY, userId);
    return (status as UserStatus) || "offline";
  } catch (err) {
    logger.error({ err, userId }, "Failed to get presence from Redis");
    return "offline";
  }
}
