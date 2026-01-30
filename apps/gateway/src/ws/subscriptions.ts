import { withRedisClient } from '../storage/redisClient';

const SUBSCRIPTIONS_KEY = 'gateway:subscriptions';
const CONNECTION_SUBS_PREFIX = 'conn_subs';

function channelKey(channel: string): string {
  return `${SUBSCRIPTIONS_KEY}:${channel}`;
}

function connectionKey(connectionId: string): string {
  return `${CONNECTION_SUBS_PREFIX}:${connectionId}`;
}

export async function subscribeToChannel(connectionId: string, channel: string): Promise<void> {
  await withRedisClient(
    async (redis) => {
      await redis.sAdd(channelKey(channel), connectionId);
      await redis.sAdd(connectionKey(connectionId), channel);
    },
    {
      fallback: undefined,
      logMessage: 'ws.subscriptions.subscribe.failed',
      context: { connectionId, channel },
    },
  );
}

export async function unsubscribeFromChannel(connectionId: string, channel: string): Promise<void> {
  await withRedisClient(
    async (redis) => {
      await redis.sRem(channelKey(channel), connectionId);
      await redis.sRem(connectionKey(connectionId), channel);
    },
    {
      fallback: undefined,
      logMessage: 'ws.subscriptions.unsubscribe.failed',
      context: { connectionId, channel },
    },
  );
}

export async function unsubscribeAll(connectionId: string): Promise<void> {
  await withRedisClient(
    async (redis) => {
      const channels = await redis.sMembers(connectionKey(connectionId));
      for (const channel of channels) {
        await redis.sRem(channelKey(channel), connectionId);
      }
      await redis.del(connectionKey(connectionId));
    },
    {
      fallback: undefined,
      logMessage: 'ws.subscriptions.unsubscribeAll.failed',
      context: { connectionId },
    },
  );
}

export async function getSubscribedChannels(connectionId: string): Promise<string[]> {
  return await withRedisClient(
    async (redis) => redis.sMembers(connectionKey(connectionId)),
    {
      fallback: [],
      logMessage: 'ws.subscriptions.getSubscribedChannels.failed',
      context: { connectionId },
    },
  );
}

export async function getSubscribers(channel: string): Promise<string[]> {
  return await withRedisClient(
    async (redis) => redis.sMembers(channelKey(channel)),
    {
      fallback: [],
      logMessage: 'ws.subscriptions.getSubscribers.failed',
      context: { channel },
    },
  );
}
