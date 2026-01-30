import { withRedisClient } from './redisClient';

const PRESENCE_KEY = 'gateway:presence';

export type UserStatus = 'online' | 'away' | 'offline';

function normalizePresenceStatus(value: unknown): UserStatus {
  if (value === 'online' || value === 'away') {
    return value;
  }
  return 'offline';
}

export async function updatePresence(userId: string, status: UserStatus): Promise<void> {
  await withRedisClient(
    async (redis) => {
      if (status === 'offline') {
        await redis.hDel(PRESENCE_KEY, userId);
        return;
      }

      await redis.hSet(PRESENCE_KEY, userId, status);
    },
    {
      fallback: undefined,
      logMessage: 'presence.update.failed',
      context: { userId, status },
    },
  );
}

export async function getPresence(userId: string): Promise<UserStatus> {
  return await withRedisClient(
    async (redis) => {
      const status = await redis.hGet(PRESENCE_KEY, userId);
      return normalizePresenceStatus(status);
    },
    {
      fallback: 'offline',
      logMessage: 'presence.get.failed',
      context: { userId },
    },
  );
}
