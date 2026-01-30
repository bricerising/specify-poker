import { createRedisKeyedStringCache } from './redisCache';

const DELETED_TTL_SECONDS = 30 * 24 * 60 * 60;

function deletedKey(userId: string): string {
  return `player:deleted:${userId}`;
}

const deletedFlagCache = createRedisKeyedStringCache<string>({
  key: deletedKey,
  ttlSeconds: DELETED_TTL_SECONDS,
});

export async function isDeletedMulti(userIds: string[]): Promise<Set<string>> {
  const deleted = new Set<string>();
  const results = await deletedFlagCache.getMulti(userIds);
  results.forEach((value, userId) => {
    if (value === '1') {
      deleted.add(userId);
    }
  });
  return deleted;
}

export async function markDeleted(userId: string): Promise<void> {
  await deletedFlagCache.set(userId, '1');
}

export async function isDeleted(userId: string): Promise<boolean> {
  const value = await deletedFlagCache.get(userId);
  return value === '1';
}

export async function clearDeleted(userId: string): Promise<void> {
  await deletedFlagCache.del(userId);
}
