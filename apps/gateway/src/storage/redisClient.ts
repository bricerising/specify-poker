import { createRedisClientManager } from "@specify-poker/shared/redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

const redis = createRedisClientManager({ url: getConfig().redisUrl, log: logger, name: "gateway" });

export async function getRedisClient() {
  return redis.getClientOrNull();
}

export async function closeRedisClient(): Promise<void> {
  await redis.close();
}
