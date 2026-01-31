import { createRedisClientsFacade } from '@specify-poker/shared/redis';
import { getConfig } from '../config';
import logger from '../observability/logger';

const redis = createRedisClientsFacade({
  getUrl: () => getConfig().redisUrl,
  log: logger,
  name: 'game',
});

export const connectRedis = async (): Promise<void> => {
  await redis.getClient();
};

export const closeRedisClient = async (): Promise<void> => {
  await redis.close();
};

export default redis.client;
