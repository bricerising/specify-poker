import { createClient, RedisClientType } from "redis";
import { getConfig } from "../config";

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
      console.warn("redis.error", { message: error.message });
    });
    connection = client
      .connect()
      .then(() => client)
      .catch((error) => {
        console.warn("redis.connect.failed", { message: error.message });
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
