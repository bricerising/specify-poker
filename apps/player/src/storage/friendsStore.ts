import * as friendsCache from './friendsCache';
import * as friendsRepository from './friendsRepository';

export type FriendsStore = {
  getFriendIds(userId: string): Promise<string[]>;
  addFriend(userId: string, friendId: string): Promise<void>;
  removeFriend(userId: string, friendId: string): Promise<void>;
  invalidateFriendIds(userId: string): Promise<void>;
};

type FriendsStoreDependencies = {
  repository: Pick<typeof friendsRepository, 'getFriends' | 'addFriend' | 'removeFriend'>;
  cache: Pick<typeof friendsCache, 'get' | 'set' | 'add' | 'remove' | 'invalidate'>;
};

export function createFriendsStore(deps: FriendsStoreDependencies): FriendsStore {
  return {
    getFriendIds: async (userId) => {
      const cached = await deps.cache.get(userId);
      if (cached !== null) {
        return cached;
      }

      const friendIds = await deps.repository.getFriends(userId);
      await deps.cache.set(userId, friendIds);
      return friendIds;
    },

    addFriend: async (userId, friendId) => {
      await deps.repository.addFriend(userId, friendId);
      await deps.cache.add(userId, friendId);
    },

    removeFriend: async (userId, friendId) => {
      await deps.repository.removeFriend(userId, friendId);
      await deps.cache.remove(userId, friendId);
    },

    invalidateFriendIds: async (userId) => {
      await deps.cache.invalidate(userId);
    },
  };
}

export const friendsStore = createFriendsStore({
  repository: friendsRepository,
  cache: friendsCache,
});

