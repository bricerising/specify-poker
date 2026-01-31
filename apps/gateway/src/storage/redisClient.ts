import { createRedisClientsFacade } from '@specify-poker/shared/redis';
import { getConfig } from '../config';
import logger from '../observability/logger';

const redis = createRedisClientsFacade({
  getUrl: () => getConfig().redisUrl,
  log: logger,
  name: 'gateway',
});

export async function getRedisClient() {
  return redis.getClientOrNull();
}

export async function closeRedisClient(): Promise<void> {
  await redis.close();
}

export type RedisClient = NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;

type WithRedisClientOptions<T> = {
  readonly fallback: T;
  readonly logMessage: string;
  readonly context?: Record<string, unknown>;
};

export async function withRedisClient<T>(
  operation: (redis: RedisClient) => Promise<T>,
  options: WithRedisClientOptions<T>,
): Promise<T> {
  const redis = await getRedisClient();
  if (!redis) {
    return options.fallback;
  }

  try {
    return await operation(redis);
  } catch (err: unknown) {
    logger.error({ err, ...options.context }, options.logMessage);
    return options.fallback;
  }
}

export function resetRedisClientForTests(): void {
  redis.resetForTests();
}
