import type { ThemePreference, UserPreferences } from '../../domain/types';
import { ValidationError } from '../../domain/errors';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new ValidationError(`${fieldName} is required`);
  }
  return normalized;
}

function decodeStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }

  const result: string[] = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (normalized) {
      result.push(normalized);
    }
  }
  return result;
}

function decodeThemePreference(value: unknown, fieldName: string): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'auto') {
    return value;
  }
  throw new ValidationError(`${fieldName} is invalid`);
}

function decodeOptionalFiniteNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${fieldName} must be a number`);
  }
  return value;
}

function decodePreferences(value: unknown): Partial<UserPreferences> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new ValidationError('preferences must be an object');
  }

  const updates: Partial<UserPreferences> = {};

  if (value.soundEnabled !== undefined) {
    if (typeof value.soundEnabled !== 'boolean') {
      throw new ValidationError('preferences.soundEnabled must be a boolean');
    }
    updates.soundEnabled = value.soundEnabled;
  }

  if (value.chatEnabled !== undefined) {
    if (typeof value.chatEnabled !== 'boolean') {
      throw new ValidationError('preferences.chatEnabled must be a boolean');
    }
    updates.chatEnabled = value.chatEnabled;
  }

  if (value.showHandStrength !== undefined) {
    if (typeof value.showHandStrength !== 'boolean') {
      throw new ValidationError('preferences.showHandStrength must be a boolean');
    }
    updates.showHandStrength = value.showHandStrength;
  }

  if (value.theme !== undefined) {
    updates.theme = decodeThemePreference(value.theme, 'preferences.theme');
  }

  return Object.keys(updates).length > 0 ? updates : undefined;
}

export type GetProfileRequest = {
  userId: string;
  referrerId?: string;
  username?: string;
};

export function decodeGetProfileRequest(value: unknown): GetProfileRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  const userId = normalizeRequiredString(value.userId, 'userId');
  const referrerId = normalizeOptionalString(value.referrerId);
  const username = normalizeOptionalString(value.username);

  return {
    userId,
    ...(referrerId ? { referrerId } : {}),
    ...(username ? { username } : {}),
  };
}

export type GetProfilesRequest = {
  userIds: string[];
};

export function decodeGetProfilesRequest(value: unknown): GetProfilesRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  return { userIds: decodeStringArray(value.userIds, 'userIds') };
}

export type UpdateProfileRequest = {
  userId: string;
  nickname?: string;
  avatarUrl?: string | null;
  preferences?: Partial<UserPreferences>;
  idempotencyKey: string;
};

export function decodeUpdateProfileRequest(value: unknown): UpdateProfileRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  const userId = normalizeRequiredString(value.userId, 'userId');
  const idempotencyKey = normalizeRequiredString(value.idempotencyKey, 'idempotencyKey');
  const nickname = normalizeOptionalString(value.nickname);

  const avatarUrlValue = value.avatarUrl;
  let avatarUrl: string | null | undefined;
  if (avatarUrlValue === '') {
    avatarUrl = null;
  } else if (avatarUrlValue === undefined || avatarUrlValue === null) {
    avatarUrl = undefined;
  } else if (typeof avatarUrlValue === 'string') {
    avatarUrl = normalizeOptionalString(avatarUrlValue);
  } else {
    throw new ValidationError('avatarUrl must be a string');
  }

  const preferences = decodePreferences(value.preferences);

  return {
    userId,
    ...(nickname ? { nickname } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    ...(preferences ? { preferences } : {}),
    idempotencyKey,
  };
}

export type DeleteProfileRequest = {
  userId: string;
  idempotencyKey: string;
};

export function decodeDeleteProfileRequest(value: unknown): DeleteProfileRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  return {
    userId: normalizeRequiredString(value.userId, 'userId'),
    idempotencyKey: normalizeRequiredString(value.idempotencyKey, 'idempotencyKey'),
  };
}

export type GetStatisticsRequest = {
  userId: string;
};

export function decodeGetStatisticsRequest(value: unknown): GetStatisticsRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  return { userId: normalizeRequiredString(value.userId, 'userId') };
}

export type IncrementStatisticRequest = {
  userId: string;
  type: string;
  amount: number;
  idempotencyKey: string;
};

export function decodeIncrementStatisticRequest(value: unknown): IncrementStatisticRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  const amount = decodeOptionalFiniteNumber(value.amount, 'amount') ?? 0;

  return {
    userId: normalizeRequiredString(value.userId, 'userId'),
    type: normalizeRequiredString(value.type, 'type'),
    amount,
    idempotencyKey: normalizeRequiredString(value.idempotencyKey, 'idempotencyKey'),
  };
}

export type GetFriendsRequest = {
  userId: string;
};

export function decodeGetFriendsRequest(value: unknown): GetFriendsRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  return { userId: normalizeRequiredString(value.userId, 'userId') };
}

export type AddFriendRequest = {
  userId: string;
  friendId: string;
  idempotencyKey: string;
};

export function decodeAddFriendRequest(value: unknown): AddFriendRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  return {
    userId: normalizeRequiredString(value.userId, 'userId'),
    friendId: normalizeRequiredString(value.friendId, 'friendId'),
    idempotencyKey: normalizeRequiredString(value.idempotencyKey, 'idempotencyKey'),
  };
}

export type RemoveFriendRequest = {
  userId: string;
  friendId: string;
  idempotencyKey: string;
};

export function decodeRemoveFriendRequest(value: unknown): RemoveFriendRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  return {
    userId: normalizeRequiredString(value.userId, 'userId'),
    friendId: normalizeRequiredString(value.friendId, 'friendId'),
    idempotencyKey: normalizeRequiredString(value.idempotencyKey, 'idempotencyKey'),
  };
}

export type GetNicknamesRequest = {
  userIds: string[];
};

export function decodeGetNicknamesRequest(value: unknown): GetNicknamesRequest {
  if (!isRecord(value)) {
    throw new ValidationError('Request must be an object');
  }

  return { userIds: decodeStringArray(value.userIds, 'userIds') };
}
