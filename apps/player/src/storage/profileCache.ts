import type { Profile } from '../domain/types';
import { decodeProfile } from '../domain/decoders';
import { createRedisKeyedJsonCache, createRedisKeyedStringCache } from './redisCache';

const PROFILE_TTL_SECONDS = 300;
const NICKNAME_TTL_SECONDS = 300;

function profileKey(userId: string): string {
  return `player:profiles:${userId}`;
}

function nicknameKey(nickname: string): string {
  return `player:profiles:by-nickname:${nickname.toLowerCase()}`;
}

const profilesCache = createRedisKeyedJsonCache<string, Profile>({
  key: profileKey,
  ttlSeconds: PROFILE_TTL_SECONDS,
  decode: decodeProfile,
});

const nicknameIndexCache = createRedisKeyedStringCache<string>({
  key: nicknameKey,
  ttlSeconds: NICKNAME_TTL_SECONDS,
});

export async function get(userId: string): Promise<Profile | null> {
  return profilesCache.get(userId);
}

export async function getMulti(userIds: string[]): Promise<Map<string, Profile>> {
  return profilesCache.getMulti(userIds);
}

export async function set(profile: Profile): Promise<void> {
  await profilesCache.set(profile.userId, profile);
  await nicknameIndexCache.set(profile.nickname, profile.userId);
}

export async function invalidate(userId: string): Promise<void> {
  await profilesCache.del(userId);
}

export async function getUserIdByNickname(nickname: string): Promise<string | null> {
  return nicknameIndexCache.get(nickname);
}

export async function deleteNickname(nickname: string): Promise<void> {
  await nicknameIndexCache.del(nickname);
}
