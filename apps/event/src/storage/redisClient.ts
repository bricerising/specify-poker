import { createClient } from "redis";
import { config } from "../config";

const client = createClient({
  url: config.redisUrl,
});

client.on('error', (err) => console.error('Redis Client Error', err));

export const connectRedis = async () => {
  if (!client.isOpen) {
    await client.connect();
  }
};

export default client;
