import { createClient, RedisClientType } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

let client: RedisClientType | null = null;
let connection: Promise<RedisClientType | null> | null = null;

export function getRedisUrl(): string | null {
  return getConfig().redisUrl;
}

export function isRedisEnabled(): boolean {
  return Boolean(getRedisUrl());
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = getRedisUrl();
  if (!url) {
    return null;
  }
  if (client) {
    return client;
  }
  if (!connection) {
    client = createClient({ url });
    client.on("error", (error) => {
      logger.warn({ message: error.message }, "redis.error");
    });
    connection = client
      .connect()
      .then(() => client)
      .catch((error) => {
        logger.warn({ message: error.message }, "redis.connect.failed");
        return null;
      });
  }
  return connection;
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
  }
  client = null;
  connection = null;
}
