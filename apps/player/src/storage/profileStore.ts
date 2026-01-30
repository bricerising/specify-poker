import type { Profile } from '../domain/types';
import * as profileCache from './profileCache';
import * as profileRepository from './profileRepository';

export type ProfileStore = {
  get(userId: string, includeDeleted?: boolean): Promise<Profile | null>;
  getMulti(userIds: readonly string[], includeDeleted?: boolean): Promise<Map<string, Profile>>;
  create(profile: Profile): Promise<{ profile: Profile; created: boolean }>;
  update(profile: Profile): Promise<Profile>;
  set(profile: Profile): Promise<void>;
  invalidate(userId: string): Promise<void>;
  deleteNickname(nickname: string): Promise<void>;
};

type ProfileStoreDependencies = {
  repository: Pick<typeof profileRepository, 'findById' | 'findByIds' | 'create' | 'update'>;
  cache: Pick<
    typeof profileCache,
    'get' | 'getMulti' | 'set' | 'invalidate' | 'deleteNickname'
  >;
};

function shouldCacheProfile(profile: Profile): boolean {
  return profile.deletedAt === null;
}

export function createProfileStore(deps: ProfileStoreDependencies): ProfileStore {
  return {
    get: async (userId, includeDeleted = false) => {
      const cached = await deps.cache.get(userId);
      if (cached) {
        if (!includeDeleted && cached.deletedAt) {
          return null;
        }
        return cached;
      }

      const existing = await deps.repository.findById(userId, includeDeleted);
      if (!existing) {
        return null;
      }

      if (shouldCacheProfile(existing)) {
        await deps.cache.set(existing);
      }

      return existing;
    },

    getMulti: async (userIds, includeDeleted = false) => {
      const result = new Map<string, Profile>();
      if (userIds.length === 0) {
        return result;
      }

      const ids = Array.from(new Set(userIds));
      const cached = await deps.cache.getMulti(ids);
      cached.forEach((value, id) => {
        if (!includeDeleted && value.deletedAt) {
          return;
        }
        result.set(id, value);
      });

      const missingIds = ids.filter((id) => !result.has(id));
      if (missingIds.length === 0) {
        return result;
      }

      const dbProfiles = await deps.repository.findByIds(missingIds, includeDeleted);
      const profilesToCache: Profile[] = [];
      for (const profile of dbProfiles) {
        if (!includeDeleted && profile.deletedAt) {
          continue;
        }
        result.set(profile.userId, profile);
        if (shouldCacheProfile(profile)) {
          profilesToCache.push(profile);
        }
      }

      await Promise.all(profilesToCache.map((profile) => deps.cache.set(profile)));
      return result;
    },

    create: async (profile) => {
      const result = await deps.repository.create(profile);
      if (shouldCacheProfile(result.profile)) {
        await deps.cache.set(result.profile);
      }
      return result;
    },

    update: async (profile) => {
      const saved = await deps.repository.update(profile);
      if (shouldCacheProfile(saved)) {
        await deps.cache.set(saved);
      } else {
        await deps.cache.invalidate(saved.userId);
      }
      return saved;
    },

    set: async (profile) => {
      if (!shouldCacheProfile(profile)) {
        await deps.cache.invalidate(profile.userId);
        return;
      }
      await deps.cache.set(profile);
    },

    invalidate: async (userId) => {
      await deps.cache.invalidate(userId);
    },

    deleteNickname: async (nickname) => {
      await deps.cache.deleteNickname(nickname);
    },
  };
}

export const profileStore = createProfileStore({
  repository: profileRepository,
  cache: profileCache,
});
