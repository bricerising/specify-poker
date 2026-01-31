import { createAsyncDisposableLazyValue } from '@specify-poker/shared';
import { createAsyncMethodProxy, createRedisClientManager } from '@specify-poker/shared/redis';
import { config } from '../config';
import logger from '../observability/logger';

type RedisManager = ReturnType<typeof createRedisClientManager>;

const defaultRedisManager = createAsyncDisposableLazyValue<RedisManager>(
  () => createRedisClientManager({ url: config.redisUrl, log: logger, name: 'game' }),
  (manager) => manager.close(),
);

const client = createAsyncMethodProxy(() => defaultRedisManager.get().getClient());

export const connectRedis = async (): Promise<void> => {
  await defaultRedisManager.get().getClient();
};

export const closeRedisClient = async (): Promise<void> => {
  await defaultRedisManager.dispose();
};

export default client;
