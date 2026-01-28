import { createAsyncMethodProxy, createRedisClientManager } from "@specify-poker/shared/redis";
import { config } from "../config";
import logger from "../observability/logger";

const redis = createRedisClientManager({ url: config.redisUrl, log: logger, name: "game" });

const client = createAsyncMethodProxy(() => redis.getClient());

export const connectRedis = async () => {
  await redis.getClient();
};

export const closeRedisClient = async () => {
  await redis.close();
};

export default client;
