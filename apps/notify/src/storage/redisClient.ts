import { createClient, RedisClientType } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    const config = getConfig();
    client = createClient({ url: config.redisUrl });
    client.on("error", (err) => logger.error({ err }, "Redis client error"));
    await client.connect();
  }
  return client;
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
