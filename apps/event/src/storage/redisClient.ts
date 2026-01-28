import { createAsyncMethodProxy, createRedisClientManager } from '@specify-poker/shared/redis';
import { config } from '../config';
import logger from '../observability/logger';

const redis = createRedisClientManager({ url: config.redisUrl, log: logger, name: 'event' });

const client = createAsyncMethodProxy(() => redis.getClient());

export const blockingRedisClient = createAsyncMethodProxy(() => redis.getBlockingClient());

export const connectRedis = async () => {
  await Promise.all([redis.getClient(), redis.getBlockingClient()]);
};

export const closeRedis = async () => {
  await redis.close();
};

export default client;
