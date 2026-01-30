import type { PoolClient } from 'pg';
import { query } from './db';

export async function getFriends(userId: string, client?: PoolClient): Promise<string[]> {
  const sql = `SELECT friend_id FROM friends WHERE user_id = $1 ORDER BY friend_id ASC`;
  const result = client
    ? await client.query<{ friend_id: string }>(sql, [userId])
    : await query<{ friend_id: string }>(sql, [userId]);
  return result.rows.map((row) => row.friend_id);
}

export async function getUsersWithFriend(friendId: string, client?: PoolClient): Promise<string[]> {
  const sql = `SELECT user_id FROM friends WHERE friend_id = $1 ORDER BY user_id ASC`;
  const result = client
    ? await client.query<{ user_id: string }>(sql, [friendId])
    : await query<{ user_id: string }>(sql, [friendId]);
  return result.rows.map((row) => row.user_id);
}

export async function addFriend(
  userId: string,
  friendId: string,
  client?: PoolClient,
): Promise<void> {
  const run = client ? client.query.bind(client) : query;
  await run(
    `INSERT INTO friends (user_id, friend_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, friendId],
  );
}

export async function removeFriend(
  userId: string,
  friendId: string,
  client?: PoolClient,
): Promise<void> {
  const run = client ? client.query.bind(client) : query;
  await run(`DELETE FROM friends WHERE user_id = $1 AND friend_id = $2`, [userId, friendId]);
}

export async function removeAllReferences(userId: string, client?: PoolClient): Promise<void> {
  const run = client ? client.query.bind(client) : query;
  await run(`DELETE FROM friends WHERE user_id = $1 OR friend_id = $1`, [userId]);
}
