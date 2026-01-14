import { defaultProfile } from "../domain/defaults";
import { Profile, ProfileSummary, UserPreferences } from "../domain/types";
import * as profileRepository from "../storage/profileRepository";
import * as profileCache from "../storage/profileCache";
import * as deletedCache from "../storage/deletedCache";
import { publishEvent } from "./eventProducer";
import { generateNickname, isAvailable, validateNickname } from "./nicknameService";
import { incrementReferralCount } from "./statisticsService";
import { requestDeletion } from "./deletionService";

const DELETED_NICKNAME = "Deleted User";

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
    nickname: DELETED_NICKNAME,
    avatarUrl: null,
    preferences: {
      soundEnabled: false,
      chatEnabled: false,
      showHandStrength: false,
      theme: "auto",
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
  return isoA.split("T")[0] === isoB.split("T")[0];
}

function isValidAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getProfile(userId: string, referrerId?: string): Promise<Profile> {
  if (await deletedCache.isDeleted(userId)) {
    return deletedProfile(userId);
  }

  const cached = await profileCache.get(userId);
  if (cached) {
    const nowIso = new Date().toISOString();
    if (!sameDay(cached.lastLoginAt, nowIso)) {
      const updated: Profile = { ...cached, lastLoginAt: nowIso, updatedAt: nowIso };
      await profileRepository.update(updated);
      await profileCache.set(updated);
      await publishEvent("DAILY_LOGIN", { userId, date: nowIso.split("T")[0] }, userId);
      return updated;
    }
    return cached;
  }

  const existing = await profileRepository.findById(userId, true);
  if (existing) {
    if (existing.deletedAt) {
      await deletedCache.markDeleted(userId);
      return deletedProfile(userId);
    }
    const nowIso = new Date().toISOString();
    if (!sameDay(existing.lastLoginAt, nowIso)) {
      const updated: Profile = { ...existing, lastLoginAt: nowIso, updatedAt: nowIso };
      const saved = await profileRepository.update(updated);
      await profileCache.set(saved);
      await publishEvent("DAILY_LOGIN", { userId, date: nowIso.split("T")[0] }, userId);
      return saved;
    }
    await profileCache.set(existing);
    return existing;
  }

  const nickname = await generateNickname(userId);
  const now = new Date();
  const profile = defaultProfile(userId, nickname, now);

  if (referrerId && referrerId !== userId) {
    profile.referredBy = referrerId;
  }

  let created = profile;
  let inserted = false;
  try {
    created = await profileRepository.create(profile);
    inserted = true;
  } catch (error: unknown) {
    const code = typeof error === "object" && error ? (error as { code?: unknown }).code : undefined;
    if (code !== "23505") {
      throw error;
    }
    const existingAfter = await profileRepository.findById(userId, true);
    if (!existingAfter) {
      throw error;
    }
    created = existingAfter;
  }

  await profileCache.set(created);

  if (inserted && referrerId && referrerId !== userId) {
    await incrementReferralCount(referrerId, 1);
    await publishEvent("REFERRAL_REWARD", { referrerId, referredId: userId }, referrerId);
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
  }
): Promise<Profile> {
  const profile = await getProfile(userId);
  const previousNickname = profile.nickname;

  if (updates.nickname !== undefined) {
    validateNickname(updates.nickname);
    if (updates.nickname !== profile.nickname) {
      const available = await isAvailable(updates.nickname);
      if (!available) {
        throw new Error("Nickname is not available");
      }
    }
    profile.nickname = updates.nickname;
  }

  if (updates.avatarUrl !== undefined) {
    if (updates.avatarUrl && !isValidAvatarUrl(updates.avatarUrl)) {
      throw new Error("Avatar URL is invalid");
    }
    profile.avatarUrl = updates.avatarUrl ?? null;
  }

  if (updates.preferences) {
    profile.preferences = {
      ...profile.preferences,
      ...updates.preferences,
    };
  }

  profile.updatedAt = new Date().toISOString();

  const saved = await profileRepository.update(profile);
  if (previousNickname !== saved.nickname) {
    await profileCache.deleteNickname(previousNickname);
  }
  await profileCache.set(saved);
  return saved;
}

export async function deleteProfile(userId: string): Promise<void> {
  await requestDeletion(userId);
}
