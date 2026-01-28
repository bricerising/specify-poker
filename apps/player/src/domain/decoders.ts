import { defaultPreferences } from './defaults';
import type { Profile, Statistics, ThemePreference, UserPreferences } from './types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function readNullableString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : null;
}

function readNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  if (typeof value !== 'number') {
    return null;
  }
  return Number.isFinite(value) ? value : null;
}

function readBoolean(record: UnknownRecord, key: string): boolean | null {
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

function decodeThemePreference(value: unknown): ThemePreference | null {
  if (value === 'light' || value === 'dark' || value === 'auto') {
    return value;
  }
  return null;
}

export function normalizeUserPreferences(value: unknown): UserPreferences {
  if (!isRecord(value)) {
    return { ...defaultPreferences };
  }

  return {
    soundEnabled: readBoolean(value, 'soundEnabled') ?? defaultPreferences.soundEnabled,
    chatEnabled: readBoolean(value, 'chatEnabled') ?? defaultPreferences.chatEnabled,
    showHandStrength: readBoolean(value, 'showHandStrength') ?? defaultPreferences.showHandStrength,
    theme: decodeThemePreference(value.theme) ?? defaultPreferences.theme,
  };
}

export function decodeProfile(value: unknown): Profile | null {
  if (!isRecord(value)) {
    return null;
  }

  const userId = readString(value, 'userId');
  const username = readString(value, 'username');
  const nickname = readString(value, 'nickname');
  const createdAt = readString(value, 'createdAt');
  const updatedAt = readString(value, 'updatedAt');

  if (!userId || !username || !nickname || !createdAt || !updatedAt) {
    return null;
  }

  const avatarUrlRaw = value.avatarUrl;
  const avatarUrl =
    avatarUrlRaw === null ? null : typeof avatarUrlRaw === 'string' ? avatarUrlRaw : null;

  return {
    userId,
    username,
    nickname,
    avatarUrl,
    preferences: normalizeUserPreferences(value.preferences),
    lastLoginAt: readNullableString(value, 'lastLoginAt'),
    referredBy: readNullableString(value, 'referredBy'),
    createdAt,
    updatedAt,
    deletedAt: readNullableString(value, 'deletedAt'),
  };
}

export function decodeStatistics(value: unknown): Statistics | null {
  if (!isRecord(value)) {
    return null;
  }

  const userId = readString(value, 'userId');
  const handsPlayed = readNumber(value, 'handsPlayed');
  const wins = readNumber(value, 'wins');
  const vpip = readNumber(value, 'vpip');
  const pfr = readNumber(value, 'pfr');
  const allInCount = readNumber(value, 'allInCount');
  const biggestPot = readNumber(value, 'biggestPot');
  const referralCount = readNumber(value, 'referralCount');
  const lastUpdated = readString(value, 'lastUpdated');

  if (
    !userId ||
    handsPlayed === null ||
    wins === null ||
    vpip === null ||
    pfr === null ||
    allInCount === null ||
    biggestPot === null ||
    referralCount === null ||
    !lastUpdated
  ) {
    return null;
  }

  return {
    userId,
    handsPlayed,
    wins,
    vpip,
    pfr,
    allInCount,
    biggestPot,
    referralCount,
    lastUpdated,
  };
}
