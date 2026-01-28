import type { Profile } from '../domain/types';
import { getRedisClient } from './redisClient';
import { decodeProfile } from '../domain/decoders';

const PROFILE_TTL_SECONDS = 300;
const NICKNAME_TTL_SECONDS = 300;

function profileKey(userId: string): string {
  return `player:profiles:${userId}`;
}

function nicknameKey(nickname: string): string {
  return `player:profiles:by-nickname:${nickname.toLowerCase()}`;
}

export async function get(userId: string): Promise<Profile | null> {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }
  const data = await redis.get(profileKey(userId));
  if (!data) {
    return null;
  }
  try {
    return decodeProfile(JSON.parse(data));
  } catch {
    return null;
  }
}

export async function getMulti(userIds: string[]): Promise<Map<string, Profile>> {
  const result = new Map<string, Profile>();
  const redis = await getRedisClient();
  if (!redis || userIds.length === 0) {
    return result;
  }

  const keys = userIds.map(profileKey);
  const values = await redis.mGet(keys);
  values.forEach((value, index) => {
    if (!value) {
      return;
    }
    try {
      const decoded = decodeProfile(JSON.parse(value));
      if (decoded) {
        result.set(userIds[index], decoded);
      }
    } catch {
      // Ignore invalid cache entries
    }
  });

  return result;
}

export async function set(profile: Profile): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.set(profileKey(profile.userId), JSON.stringify(profile), {
    EX: PROFILE_TTL_SECONDS,
  });
  await redis.set(nicknameKey(profile.nickname), profile.userId, { EX: NICKNAME_TTL_SECONDS });
}

export async function invalidate(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.del(profileKey(userId));
}

export async function getUserIdByNickname(nickname: string): Promise<string | null> {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }
  return redis.get(nicknameKey(nickname));
}

export async function deleteNickname(nickname: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }
  await redis.del(nicknameKey(nickname));
}
