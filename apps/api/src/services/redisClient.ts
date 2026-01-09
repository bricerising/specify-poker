import { createClient, RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connection: Promise<RedisClientType | null> | null = null;

export function getRedisUrl() {
  const url = process.env.REDIS_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export function isRedisEnabled() {
  return Boolean(getRedisUrl());
}

export async function getRedisClient() {
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
    connection = client.connect().then(() => client).catch((error) => {
      console.warn("redis.connect.failed", { message: error.message });
      return null;
    });
  }
  return connection;
}

export async function closeRedisClient() {
  if (client) {
    await client.quit();
  }
  client = null;
  connection = null;
}
