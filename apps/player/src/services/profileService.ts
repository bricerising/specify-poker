import { err, ok, type Result } from '@specify-poker/shared';
import { defaultProfile } from '../domain/defaults';
import type { Profile, ProfileSummary, UserPreferences } from '../domain/types';
import * as profileRepository from '../storage/profileRepository';
import * as profileCache from '../storage/profileCache';
import * as deletedCache from '../storage/deletedCache';
import { profileStore } from '../storage/profileStore';
import { publishEvent } from './eventProducer';
import { generateNickname, isAvailableForUser, normalizeNickname } from './nicknameService';
import { incrementReferralCount } from './statisticsService';
import { requestDeletion } from './deletionService';
import { type UpdateProfileError } from '../domain/errors';
import { createDeletedProfile } from '../domain/deletedUser';

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

  const nextUsername = desiredUsername && shouldUpdateUsername ? desiredUsername : null;

  return {
    updated: {
      ...profile,
      ...(shouldUpdateLogin ? { lastLoginAt: nowIso } : {}),
      ...(nextUsername ? { username: nextUsername } : {}),
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
  return createDeletedProfile(userId);
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

function isoDate(isoTimestamp: string): string {
  return isoTimestamp.split('T')[0];
}

async function applyProfileRefresh(
  profile: Profile,
  nowIso: string,
  desiredUsername: string | null,
): Promise<{ profile: Profile; didUpdate: boolean; shouldPublishDailyLogin: boolean }> {
  const refresh = getProfileRefresh(profile, nowIso, desiredUsername);
  if (!refresh.updated) {
    return { profile, didUpdate: false, shouldPublishDailyLogin: false };
  }

  const saved = await profileStore.update(refresh.updated);
  return {
    profile: saved,
    didUpdate: true,
    shouldPublishDailyLogin: refresh.shouldPublishDailyLogin,
  };
}

async function maybePublishDailyLogin(
  userId: string,
  nowIso: string,
  shouldPublishDailyLogin: boolean,
): Promise<void> {
  if (!shouldPublishDailyLogin) {
    return;
  }

  await publishEvent('DAILY_LOGIN', { userId, date: isoDate(nowIso) }, userId);
}

type GetProfileContext = {
  userId: string;
  referrerId?: string;
  desiredUsername: string | null;
  nowIso: string;
};

export type ProfileLookupStatus = 'ok' | 'deleted' | 'created';

type GetProfileResolution = {
  profile: Profile;
  shouldPublishDailyLogin: boolean;
  lookupStatus: ProfileLookupStatus;
};

type GetProfileResolver = {
  name: string;
  resolve(context: GetProfileContext): Promise<GetProfileResolution | null>;
};

async function resolveProfile(
  context: GetProfileContext,
  resolvers: readonly GetProfileResolver[],
): Promise<GetProfileResolution> {
  for (const resolver of resolvers) {
    const result = await resolver.resolve(context);
    if (result) {
      return result;
    }
  }

  throw new Error('player.profileService.no_resolver_matched');
}

const deletedCacheResolver: GetProfileResolver = {
  name: 'deleted_cache',
  resolve: async ({ userId }) => {
    if (!(await deletedCache.isDeleted(userId))) {
      return null;
    }

    return {
      profile: deletedProfile(userId),
      shouldPublishDailyLogin: false,
      lookupStatus: 'deleted',
    };
  },
};

const profileCacheResolver: GetProfileResolver = {
  name: 'profile_cache',
  resolve: async ({ userId, nowIso, desiredUsername }) => {
    const cached = await profileCache.get(userId);
    if (!cached) {
      return null;
    }

    if (cached.deletedAt) {
      await deletedCache.markDeleted(userId);
      return {
        profile: deletedProfile(userId),
        shouldPublishDailyLogin: false,
        lookupStatus: 'deleted',
      };
    }

    const refreshed = await applyProfileRefresh(cached, nowIso, desiredUsername);
    return {
      profile: refreshed.profile,
      shouldPublishDailyLogin: refreshed.shouldPublishDailyLogin,
      lookupStatus: 'ok',
    };
  },
};

const repositoryResolver: GetProfileResolver = {
  name: 'repository',
  resolve: async ({ userId, nowIso, desiredUsername }) => {
    const existing = await profileRepository.findById(userId, true);
    if (!existing) {
      return null;
    }

    if (existing.deletedAt) {
      await deletedCache.markDeleted(userId);
      return {
        profile: deletedProfile(userId),
        shouldPublishDailyLogin: false,
        lookupStatus: 'deleted',
      };
    }

    const refreshed = await applyProfileRefresh(existing, nowIso, desiredUsername);
    if (!refreshed.didUpdate) {
      await profileStore.set(existing);
    }
    return {
      profile: refreshed.profile,
      shouldPublishDailyLogin: refreshed.shouldPublishDailyLogin,
      lookupStatus: 'ok',
    };
  },
};

const createProfileResolver: GetProfileResolver = {
  name: 'create_profile',
  resolve: async ({ userId, referrerId, desiredUsername, nowIso }) => {
    const nickname = await generateNickname(userId);
    const now = new Date(nowIso);
    const profile = defaultProfile(userId, nickname, now, desiredUsername ?? '');

    if (referrerId && referrerId !== userId) {
      profile.referredBy = referrerId;
    }

    const createResult = await profileStore.create(profile);
    const created = createResult.profile;
    const inserted = createResult.created;

    if (inserted && referrerId && referrerId !== userId) {
      await incrementReferralCount(referrerId, 1);
      await publishEvent('REFERRAL_REWARD', { referrerId, referredId: userId }, referrerId);
    }

    return {
      profile: created,
      shouldPublishDailyLogin: false,
      lookupStatus: inserted ? 'created' : 'ok',
    };
  },
};

const defaultGetProfileResolvers: readonly GetProfileResolver[] = [
  deletedCacheResolver,
  profileCacheResolver,
  repositoryResolver,
  createProfileResolver,
];

export async function getProfile(
  userId: string,
  referrerId?: string,
  username?: string,
): Promise<Profile> {
  const result = await getProfileWithLookupStatus(userId, referrerId, username);
  return result.profile;
}

export async function getProfileWithLookupStatus(
  userId: string,
  referrerId?: string,
  username?: string,
): Promise<{ profile: Profile; lookupStatus: ProfileLookupStatus }> {
  const desiredUsername = normalizeUsername(username);
  const nowIso = new Date().toISOString();

  const { profile, shouldPublishDailyLogin, lookupStatus } = await resolveProfile(
    { userId, referrerId, desiredUsername, nowIso },
    defaultGetProfileResolvers,
  );

  await maybePublishDailyLogin(userId, nowIso, shouldPublishDailyLogin);
  return { profile, lookupStatus };
}

export async function getProfiles(userIds: string[]): Promise<Profile[]> {
  if (userIds.length === 0) {
    return [];
  }

  const deletedUserIds = await deletedCache.isDeletedMulti(userIds);
  const activeUserIds = Array.from(new Set(userIds.filter((id) => !deletedUserIds.has(id))));

  const profilesByUserId = await profileStore.getMulti(activeUserIds, true);
  const missingUserIds = activeUserIds.filter((userId) => !profilesByUserId.has(userId));

  if (missingUserIds.length > 0) {
    const nowIso = new Date().toISOString();
    for (const userId of missingUserIds) {
      const created = await createProfileResolver.resolve({
        userId,
        desiredUsername: null,
        nowIso,
      });

      if (!created) {
        throw new Error('player.profileService.create_profile_failed');
      }

      profilesByUserId.set(userId, created.profile);
    }
  }

  const deletedToMark = new Set<string>();
  const profiles: Profile[] = [];
  for (const userId of userIds) {
    if (deletedUserIds.has(userId)) {
      profiles.push(deletedProfile(userId));
      continue;
    }

    const existing = profilesByUserId.get(userId);
    if (!existing) {
      throw new Error('player.profileService.profile_missing_after_resolution');
    }

    if (existing.deletedAt) {
      deletedToMark.add(userId);
      profiles.push(deletedProfile(userId));
      continue;
    }

    profiles.push(existing);
  }

  await Promise.all(Array.from(deletedToMark, (userId) => deletedCache.markDeleted(userId)));

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
): Promise<Result<Profile, UpdateProfileError>> {
  const { profile: current, lookupStatus } = await getProfileWithLookupStatus(userId);
  if (lookupStatus === 'deleted' || current.deletedAt) {
    return err({ type: 'NotFound' });
  }
  const previousNickname = current.nickname;
  let nickname = current.nickname;
  let avatarUrl = current.avatarUrl;
  let preferences = current.preferences;

  if (updates.nickname !== undefined) {
    const nextNickname = normalizeNickname(updates.nickname);
    if (nextNickname !== current.nickname) {
      const available = await isAvailableForUser(nextNickname, userId);
      if (!available) {
        return err({ type: 'NicknameConflict', nickname: nextNickname });
      }
    }
    nickname = nextNickname;
  }

  if (updates.avatarUrl !== undefined) {
    if (updates.avatarUrl && !isValidAvatarUrl(updates.avatarUrl)) {
      return err({ type: 'InvalidAvatarUrl', url: updates.avatarUrl });
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

  const saved = await profileStore.update({
    ...current,
    nickname,
    avatarUrl,
    preferences,
    updatedAt,
  });
  if (previousNickname !== saved.nickname) {
    await profileStore.deleteNickname(previousNickname);
  }
  return ok(saved);
}

export async function deleteProfile(userId: string): Promise<void> {
  await requestDeletion(userId);
}
