import type { PoolClient } from 'pg';
import { query } from './db';
import type { Profile } from '../domain/types';
import { normalizeUserPreferences } from '../domain/decoders';

const profileColumns = `user_id, username, nickname, avatar_url, preferences, last_login_at, referred_by, created_at, updated_at, deleted_at`;

interface ProfileRow {
  user_id: string;
  username: string;
  nickname: string;
  avatar_url: string | null;
  preferences: unknown;
  last_login_at: Date | null;
  referred_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function mapProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    preferences: normalizeUserPreferences(row.preferences),
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    referredBy: row.referred_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

export async function findById(userId: string, includeDeleted = false): Promise<Profile | null> {
  const condition = includeDeleted ? '' : 'AND deleted_at IS NULL';
  const result = await query<ProfileRow>(
    `SELECT ${profileColumns} FROM profiles WHERE user_id = $1 ${condition}`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapProfile(result.rows[0]);
}

export async function findByIds(userIds: string[], includeDeleted = false): Promise<Profile[]> {
  if (userIds.length === 0) {
    return [];
  }
  const condition = includeDeleted ? '' : 'AND deleted_at IS NULL';
  const result = await query<ProfileRow>(
    `SELECT ${profileColumns} FROM profiles WHERE user_id = ANY($1::varchar[]) ${condition}`,
    [userIds],
  );

  return result.rows.map(mapProfile);
}

export async function findByNickname(nickname: string): Promise<Profile | null> {
  const result = await query<ProfileRow>(
    `SELECT ${profileColumns} FROM profiles WHERE nickname = $1 AND deleted_at IS NULL LIMIT 1`,
    [nickname],
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapProfile(result.rows[0]);
}

export async function create(
  profile: Profile,
  client?: PoolClient,
): Promise<{ profile: Profile; created: boolean }> {
  const sql = `INSERT INTO profiles (user_id, username, nickname, avatar_url, preferences, last_login_at, referred_by, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING ${profileColumns}`;
  const params = [
    profile.userId,
    profile.username,
    profile.nickname,
    profile.avatarUrl,
    profile.preferences,
    profile.lastLoginAt ? new Date(profile.lastLoginAt) : null,
    profile.referredBy,
    new Date(profile.createdAt),
    new Date(profile.updatedAt),
    profile.deletedAt ? new Date(profile.deletedAt) : null,
  ];
  const result = client
    ? await client.query<ProfileRow>(sql, params)
    : await query<ProfileRow>(sql, params);
  const row = result.rows[0];
  if (row) {
    return { profile: mapProfile(row), created: true };
  }

  const selectSql = `SELECT ${profileColumns} FROM profiles WHERE user_id = $1`;
  const selectResult = client
    ? await client.query<ProfileRow>(selectSql, [profile.userId])
    : await query<ProfileRow>(selectSql, [profile.userId]);

  const existingRow = selectResult.rows[0];
  if (!existingRow) {
    throw new Error('PROFILE_CREATE_FAILED');
  }

  return { profile: mapProfile(existingRow), created: false };
}

export async function update(profile: Profile, client?: PoolClient): Promise<Profile> {
  const sql = `UPDATE profiles
     SET username = $2,
         nickname = $3,
         avatar_url = $4,
         preferences = $5,
         last_login_at = $6,
         referred_by = $7,
         updated_at = $8,
         deleted_at = $9
     WHERE user_id = $1
     RETURNING ${profileColumns}`;
  const params = [
    profile.userId,
    profile.username,
    profile.nickname,
    profile.avatarUrl,
    profile.preferences,
    profile.lastLoginAt ? new Date(profile.lastLoginAt) : null,
    profile.referredBy,
    new Date(profile.updatedAt),
    profile.deletedAt ? new Date(profile.deletedAt) : null,
  ];
  const result = client
    ? await client.query<ProfileRow>(sql, params)
    : await query<ProfileRow>(sql, params);
  return mapProfile(result.rows[0]);
}

export async function upsert(profile: Profile): Promise<Profile> {
  const result = await query<ProfileRow>(
    `INSERT INTO profiles (user_id, username, nickname, avatar_url, preferences, last_login_at, referred_by, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id)
     DO UPDATE SET username = EXCLUDED.username,
                  nickname = EXCLUDED.nickname,
                  avatar_url = EXCLUDED.avatar_url,
                  preferences = EXCLUDED.preferences,
                  last_login_at = EXCLUDED.last_login_at,
                  referred_by = EXCLUDED.referred_by,
                  updated_at = EXCLUDED.updated_at,
                  deleted_at = EXCLUDED.deleted_at
     RETURNING ${profileColumns}`,
    [
      profile.userId,
      profile.username,
      profile.nickname,
      profile.avatarUrl,
      profile.preferences,
      profile.lastLoginAt ? new Date(profile.lastLoginAt) : null,
      profile.referredBy,
      new Date(profile.createdAt),
      new Date(profile.updatedAt),
      profile.deletedAt ? new Date(profile.deletedAt) : null,
    ],
  );

  return mapProfile(result.rows[0]);
}

export async function softDelete(userId: string, deletedAt: Date): Promise<void> {
  await query(
    `UPDATE profiles
     SET deleted_at = $2,
         nickname = 'Deleted User',
         username = 'Deleted User',
         avatar_url = NULL,
         preferences = $3,
         updated_at = $2
     WHERE user_id = $1`,
    [userId, deletedAt, {}],
  );
}

export async function hardDelete(userId: string): Promise<void> {
  await query(`DELETE FROM profiles WHERE user_id = $1`, [userId]);
}

export async function touchLogin(userId: string, lastLoginAt: Date): Promise<void> {
  await query(
    `UPDATE profiles
     SET last_login_at = $2,
         updated_at = $2
     WHERE user_id = $1`,
    [userId, lastLoginAt],
  );
}
