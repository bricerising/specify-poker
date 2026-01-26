import { createClient } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connection: Promise<RedisClient | null> | null = null;

export function getRedisUrl(): string | null {
  return getConfig().redisUrl;
}

export function isRedisEnabled(): boolean {
  return Boolean(getRedisUrl());
}

export async function getRedisClient(): Promise<RedisClient | null> {
  const url = getRedisUrl();
  if (!url) {
    return null;
  }
  if (client) {
    return client;
  }
  if (!connection) {
    const nextClient = createClient({ url });
    nextClient.on("error", (error) => {
      logger.warn({ message: error.message }, "redis.error");
    });
    connection = nextClient
      .connect()
      .then(() => {
        client = nextClient;
        return nextClient;
      })
      .catch((error) => {
        logger.warn({ message: error.message }, "redis.connect.failed");
        connection = null;
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
