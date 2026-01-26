import { createClient } from "redis";
import { config } from "../config";
import logger from "../observability/logger";

const client = createClient({
  url: config.redisUrl,
});

export const blockingRedisClient = client.duplicate();

client.on("error", (err) => logger.error({ error: err }, "Redis Client Error"));
blockingRedisClient.on("error", (err) => logger.error({ error: err }, "Redis Blocking Client Error"));

export const connectRedis = async () => {
  if (!client.isOpen) {
    await client.connect();
  }
  if (!blockingRedisClient.isOpen) {
    await blockingRedisClient.connect();
  }
};

let closePromise: Promise<void> | null = null;

export function closeRedis(): Promise<void> {
  if (closePromise) {
    return closePromise;
  }

  closePromise = (async () => {
    const closeClient = async (c: typeof client) => {
      if (!c.isOpen) {
        return;
      }
      try {
        await c.quit();
      } catch (error) {
        logger.warn({ err: error }, "Redis quit failed; forcing disconnect");
        c.disconnect();
      }
    };

    await Promise.all([closeClient(client), closeClient(blockingRedisClient)]);
  })();

  return closePromise;
}

export default client;
