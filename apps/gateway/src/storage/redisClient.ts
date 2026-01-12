import { createClient, RedisClientType } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

let client: RedisClientType | null = null;
let connection: Promise<RedisClientType | null> | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  const config = getConfig();
  const url = config.redisUrl;
  
  if (client) {
    return client;
  }
  
  if (!connection) {
    client = createClient({ url });
    client.on("error", (error) => {
      logger.error({ err: error }, "Redis error");
    });
    connection = client.connect().then(() => {
      logger.info("Connected to Redis");
      return client;
    }).catch((error) => {
      logger.error({ err: error }, "Redis connection failed");
      client = null;
      connection = null;
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
