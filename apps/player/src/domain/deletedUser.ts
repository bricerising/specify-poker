import type { Profile, UserPreferences } from './types';

export const DELETED_USER_DISPLAY_NAME = 'Deleted User';

export const deletedUserPreferences: UserPreferences = {
  soundEnabled: false,
  chatEnabled: false,
  showHandStrength: false,
  theme: 'auto',
};

export function createDeletedProfile(userId: string, now: Date = new Date()): Profile {
  const timestamp = now.toISOString();
  return {
    userId,
    username: DELETED_USER_DISPLAY_NAME,
    nickname: DELETED_USER_DISPLAY_NAME,
    avatarUrl: null,
    preferences: { ...deletedUserPreferences },
    lastLoginAt: null,
    referredBy: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp,
  };
}
