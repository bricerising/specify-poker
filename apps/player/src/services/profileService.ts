import { defaultProfile } from '../domain/defaults';
import type { Profile, ProfileSummary, UserPreferences } from '../domain/types';
import * as profileRepository from '../storage/profileRepository';
import * as profileCache from '../storage/profileCache';
import * as deletedCache from '../storage/deletedCache';
import { publishEvent } from './eventProducer';
import { generateNickname, isAvailable, validateNickname } from './nicknameService';
import { incrementReferralCount } from './statisticsService';
import { requestDeletion } from './deletionService';
import { ConflictError, ValidationError } from '../domain/errors';

const DELETED_NICKNAME = 'Deleted User';

function getProfileRefresh(
  profile: Profile,
  nowIso: string,
  desiredUsername: string | null,
): { updated: Profile | null; shouldPublishDailyLogin: boolean } {
  const shouldUpdateLogin = !sameDay(profile.lastLoginAt, nowIso);
  const shouldUpdateUsername = Boolean(desiredUsername) && desiredUsername !== profile.username;

  if (!shouldUpdateLogin && !shouldUpdateUsername) {
    return { updated: null, shouldPublishDailyLogin: false };
  }

  return {
    updated: {
      ...profile,
      ...(shouldUpdateLogin ? { lastLoginAt: nowIso } : {}),
      ...(shouldUpdateUsername ? { username: desiredUsername! } : {}),
      updatedAt: nowIso,
    },
    shouldPublishDailyLogin: shouldUpdateLogin,
  };
}

function toSummary(profile: Profile): ProfileSummary {
  return {
    userId: profile.userId,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
  };
}

function deletedProfile(userId: string): Profile {
  const now = new Date().toISOString();
  return {
    userId,
    username: DELETED_NICKNAME,
    nickname: DELETED_NICKNAME,
    avatarUrl: null,
    preferences: {
      soundEnabled: false,
      chatEnabled: false,
      showHandStrength: false,
      theme: 'auto',
    },
    lastLoginAt: null,
    referredBy: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: now,
  };
}

function sameDay(isoA: string | null, isoB: string): boolean {
  if (!isoA) {
    return false;
  }
  return isoA.split('T')[0] === isoB.split('T')[0];
}

function isValidAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeUsername(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getProfile(
  userId: string,
  referrerId?: string,
  username?: string,
): Promise<Profile> {
  if (await deletedCache.isDeleted(userId)) {
    return deletedProfile(userId);
  }

  const desiredUsername = normalizeUsername(username);
  const cached = await profileCache.get(userId);
  if (cached) {
    const nowIso = new Date().toISOString();
    const refresh = getProfileRefresh(cached, nowIso, desiredUsername);
    if (!refresh.updated) {
      return cached;
    }

    const saved = await profileRepository.update(refresh.updated);
    await profileCache.set(saved);
    if (refresh.shouldPublishDailyLogin) {
      await publishEvent('DAILY_LOGIN', { userId, date: nowIso.split('T')[0] }, userId);
    }
    return saved;
  }

  const existing = await profileRepository.findById(userId, true);
  if (existing) {
    if (existing.deletedAt) {
      await deletedCache.markDeleted(userId);
      return deletedProfile(userId);
    }
    const nowIso = new Date().toISOString();
    const refresh = getProfileRefresh(existing, nowIso, desiredUsername);
    if (refresh.updated) {
      const saved = await profileRepository.update(refresh.updated);
      await profileCache.set(saved);
      if (refresh.shouldPublishDailyLogin) {
        await publishEvent('DAILY_LOGIN', { userId, date: nowIso.split('T')[0] }, userId);
      }
      return saved;
    }

    await profileCache.set(existing);
    return existing;
  }

  const nickname = await generateNickname(userId);
  const now = new Date();
  const profile = defaultProfile(userId, nickname, now, desiredUsername ?? '');

  if (referrerId && referrerId !== userId) {
    profile.referredBy = referrerId;
  }

  const createResult = await profileRepository.create(profile);
  const created = createResult.profile;
  const inserted = createResult.created;

  await profileCache.set(created);

  if (inserted && referrerId && referrerId !== userId) {
    await incrementReferralCount(referrerId, 1);
    await publishEvent('REFERRAL_REWARD', { referrerId, referredId: userId }, referrerId);
  }

  return created;
}

export async function getProfiles(userIds: string[]): Promise<Profile[]> {
  const cacheResults = await profileCache.getMulti(userIds);
  const missingIds = userIds.filter((id) => !cacheResults.has(id));

  let dbProfiles: Profile[] = [];
  if (missingIds.length > 0) {
    dbProfiles = await profileRepository.findByIds(missingIds, true);
  }

  const foundMap = new Map<string, Profile>();
  for (const profile of dbProfiles) {
    foundMap.set(profile.userId, profile);
    if (!profile.deletedAt) {
      await profileCache.set(profile);
    }
  }

  const profiles: Profile[] = [];
  for (const userId of userIds) {
    if (await deletedCache.isDeleted(userId)) {
      profiles.push(deletedProfile(userId));
      continue;
    }
    const cached = cacheResults.get(userId);
    if (cached) {
      profiles.push(cached);
      continue;
    }
    const existing = foundMap.get(userId);
    if (existing) {
      if (existing.deletedAt) {
        await deletedCache.markDeleted(userId);
        profiles.push(deletedProfile(userId));
      } else {
        profiles.push(existing);
      }
      continue;
    }
    const created = await getProfile(userId);
    profiles.push(created);
  }

  return profiles;
}

export async function getProfileSummaries(userIds: string[]): Promise<ProfileSummary[]> {
  const profiles = await getProfiles(userIds);
  return profiles.map((profile) => toSummary(profile));
}

export async function updateProfile(
  userId: string,
  updates: {
    nickname?: string;
    avatarUrl?: string | null;
    preferences?: Partial<UserPreferences>;
  },
): Promise<Profile> {
  const current = await getProfile(userId);
  const previousNickname = current.nickname;
  let nickname = current.nickname;
  let avatarUrl = current.avatarUrl;
  let preferences = current.preferences;

  if (updates.nickname !== undefined) {
    validateNickname(updates.nickname);
    if (updates.nickname !== current.nickname) {
      const available = await isAvailable(updates.nickname);
      if (!available) {
        throw new ConflictError('Nickname is not available');
      }
    }
    nickname = updates.nickname;
  }

  if (updates.avatarUrl !== undefined) {
    if (updates.avatarUrl && !isValidAvatarUrl(updates.avatarUrl)) {
      throw new ValidationError('Avatar URL is invalid');
    }
    avatarUrl = updates.avatarUrl ?? null;
  }

  if (updates.preferences) {
    preferences = {
      ...current.preferences,
      ...updates.preferences,
    };
  }

  const updatedAt = new Date().toISOString();

  const saved = await profileRepository.update({
    ...current,
    nickname,
    avatarUrl,
    preferences,
    updatedAt,
  });
  if (previousNickname !== saved.nickname) {
    await profileCache.deleteNickname(previousNickname);
  }
  await profileCache.set(saved);
  return saved;
}

export async function deleteProfile(userId: string): Promise<void> {
  await requestDeletion(userId);
}
