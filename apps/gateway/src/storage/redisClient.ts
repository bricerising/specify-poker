import { createRedisClientManager } from '@specify-poker/shared/redis';
import { createAsyncDisposableLazyValue } from '@specify-poker/shared';
import { getConfig } from '../config';
import logger from '../observability/logger';

type RedisManager = ReturnType<typeof createRedisClientManager>;

const defaultRedisManager = createAsyncDisposableLazyValue<RedisManager>(
  () => {
    const config = getConfig();
    return createRedisClientManager({ url: config.redisUrl, log: logger, name: 'gateway' });
  },
  (manager) => manager.close(),
);

export async function getRedisClient() {
  return defaultRedisManager.get().getClientOrNull();
}

export async function closeRedisClient(): Promise<void> {
  await defaultRedisManager.dispose();
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
  defaultRedisManager.reset();
}
