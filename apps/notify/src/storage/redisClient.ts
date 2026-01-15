import { createClient, RedisClientType } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

let client: RedisClientType | null = null;
let blockingClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    const config = getConfig();
    client = createClient({ url: config.redisUrl });
    client.on("error", (err) => logger.error({ err }, "Redis client error"));
    await client.connect();
  }
  return client;
}

export async function getBlockingRedisClient(): Promise<RedisClientType> {
  if (!blockingClient) {
    const config = getConfig();
    blockingClient = client ? client.duplicate() : createClient({ url: config.redisUrl });
    blockingClient.on("error", (err) => logger.error({ err }, "Redis blocking client error"));
    await blockingClient.connect();
  }
  return blockingClient;
}

export async function closeRedisClient(): Promise<void> {
  if (blockingClient) {
    await blockingClient.quit();
    blockingClient = null;
  }
  if (client) {
    await client.quit();
    client = null;
  }
}
