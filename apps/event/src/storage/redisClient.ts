import { createClient } from "redis";
import { config } from "../config";

const client = createClient({
  url: config.redisUrl,
});

export const blockingRedisClient = client.duplicate();

client.on("error", (err) => console.error("Redis Client Error", err));
blockingRedisClient.on("error", (err) => console.error("Redis Blocking Client Error", err));

export const connectRedis = async () => {
  if (!client.isOpen) {
    await client.connect();
  }
  if (!blockingRedisClient.isOpen) {
    await blockingRedisClient.connect();
  }
};

export default client;
