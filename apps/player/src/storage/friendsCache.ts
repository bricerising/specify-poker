import { getRedisClient } from './redisClient';
import { createRedisKeyedJsonCache } from './redisCache';

const FRIENDS_TTL_SECONDS = 300;

function friendsKey(userId: string): string {
  return `player:friends:${userId}`;
}

function normalizeFriendIds(friendIds: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const friendId of friendIds) {
    if (typeof friendId !== 'string') {
      continue;
    }
    const trimmed = friendId.trim();
    if (trimmed.length === 0) {
      continue;
    }
    unique.add(trimmed);
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

function decodeFriendIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    items.push(trimmed);
  }
  return normalizeFriendIds(items);
}

const friendsJsonCache = createRedisKeyedJsonCache<string, string[]>({
  key: friendsKey,
  ttlSeconds: FRIENDS_TTL_SECONDS,
  decode: decodeFriendIds,
  encode: normalizeFriendIds,
});

export async function get(userId: string): Promise<string[] | null> {
  let redis: Awaited<ReturnType<typeof getRedisClient>>;
  try {
    redis = await getRedisClient();
  } catch {
    redis = null;
  }
  if (!redis) {
    return null;
  }

  const key = friendsKey(userId);

  // Preferred storage: JSON string array.
  let data: string | null;
  let shouldFallbackToLegacy = false;
  try {
    data = await redis.get(key);
  } catch {
    data = null;
    shouldFallbackToLegacy = true;
  }

  if (data === null) {
    if (!shouldFallbackToLegacy) {
      return null;
    }

    // Fall back to legacy set-based cache.
    try {
      const members = await redis.sMembers(key);
      if (members.length === 0) {
        return null;
      }
      const normalized = normalizeFriendIds(members);
      await redis.set(key, JSON.stringify(normalized), { EX: FRIENDS_TTL_SECONDS });
      return normalized;
    } catch {
      return null;
    }
  }

  try {
    const decoded = decodeFriendIds(JSON.parse(data));
    return decoded ?? null;
  } catch {
    return null;
  }
}

export async function set(userId: string, friendIds: string[]): Promise<void> {
  await friendsJsonCache.set(userId, friendIds);
}

export async function add(userId: string, friendId: string): Promise<void> {
  const cached = await get(userId);
  if (cached === null) {
    return;
  }
  await set(userId, [...cached, friendId]);
}

export async function remove(userId: string, friendId: string): Promise<void> {
  const cached = await get(userId);
  if (cached === null) {
    return;
  }

  const next = cached.filter((id) => id !== friendId);
  await set(userId, next);
}

export async function invalidate(userId: string): Promise<void> {
  await friendsJsonCache.del(userId);
}
