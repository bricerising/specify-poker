import { createRedisClientsFacade } from '@specify-poker/shared/redis';
import { getConfig } from '../config';
import logger from '../observability/logger';

const redis = createRedisClientsFacade({
  getUrl: () => getConfig().redisUrl,
  log: logger,
  name: 'event',
});

export const blockingRedisClient = redis.blockingClient;

export const connectRedis = async () => {
  await Promise.all([redis.getClient(), redis.getBlockingClient()]);
};

export const closeRedis = async () => {
  await redis.close();
};

export default redis.client;
