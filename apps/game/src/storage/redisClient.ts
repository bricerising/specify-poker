import { createClient } from "redis";
import { config } from "../config";
import logger from "../observability/logger";

const client = createClient({
  url: config.redisUrl,
});

client.on("error", (err) => logger.error({ err }, "Redis Client Error"));

export const connectRedis = async () => {
  if (!client.isOpen) {
    await client.connect();
  }
};

export const closeRedisClient = async () => {
  if (client.isOpen) {
    await client.quit();
  }
};

export default client;
