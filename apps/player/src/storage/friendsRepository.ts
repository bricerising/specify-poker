import { query } from './db';

export async function getFriends(userId: string): Promise<string[]> {
  const result = await query<{ friend_id: string }>(
    `SELECT friend_id FROM friends WHERE user_id = $1 ORDER BY friend_id ASC`,
    [userId],
  );
  return result.rows.map((row) => row.friend_id);
}

export async function addFriend(userId: string, friendId: string): Promise<void> {
  await query(
    `INSERT INTO friends (user_id, friend_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, friendId],
  );
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await query(`DELETE FROM friends WHERE user_id = $1 AND friend_id = $2`, [userId, friendId]);
}

export async function removeAllReferences(userId: string): Promise<void> {
  await query(`DELETE FROM friends WHERE user_id = $1 OR friend_id = $1`, [userId]);
}
