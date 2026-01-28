import { getRedisClient } from '../storage/redisClient';
import logger from '../observability/logger';

const SUBSCRIPTIONS_KEY = 'gateway:subscriptions';
const CONNECTION_SUBS_PREFIX = 'conn_subs';

function channelKey(channel: string): string {
  return `${SUBSCRIPTIONS_KEY}:${channel}`;
}

function connectionKey(connectionId: string): string {
  return `${CONNECTION_SUBS_PREFIX}:${connectionId}`;
}

type RedisClient = NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;
type RedisOperation<T> = (redis: RedisClient) => Promise<T>;

async function withRedis<T>(
  operation: RedisOperation<T>,
  context: Record<string, unknown>,
  errorMessage: string,
  fallback: T,
): Promise<T> {
  const redis = await getRedisClient();
  if (!redis) return fallback;

  try {
    return await operation(redis);
  } catch (err) {
    logger.error({ err, ...context }, errorMessage);
    return fallback;
  }
}

export async function subscribeToChannel(connectionId: string, channel: string): Promise<void> {
  await withRedis(
    async (redis) => {
      await redis.sAdd(channelKey(channel), connectionId);
      await redis.sAdd(connectionKey(connectionId), channel);
    },
    { connectionId, channel },
    'Failed to subscribe to channel',
    undefined,
  );
}

export async function unsubscribeFromChannel(connectionId: string, channel: string): Promise<void> {
  await withRedis(
    async (redis) => {
      await redis.sRem(channelKey(channel), connectionId);
      await redis.sRem(connectionKey(connectionId), channel);
    },
    { connectionId, channel },
    'Failed to unsubscribe from channel',
    undefined,
  );
}

export async function unsubscribeAll(connectionId: string): Promise<void> {
  await withRedis(
    async (redis) => {
      const channels = await redis.sMembers(connectionKey(connectionId));
      for (const channel of channels) {
        await redis.sRem(channelKey(channel), connectionId);
      }
      await redis.del(connectionKey(connectionId));
    },
    { connectionId },
    'Failed to unsubscribe from all channels',
    undefined,
  );
}

export async function getSubscribers(channel: string): Promise<string[]> {
  return withRedis(
    async (redis) => redis.sMembers(channelKey(channel)),
    { channel },
    'Failed to get subscribers for channel',
    [],
  );
}
