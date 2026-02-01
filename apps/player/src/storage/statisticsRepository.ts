import type { PoolClient } from 'pg';
import { query } from './db';
import type { Statistics } from '../domain/types';

interface StatisticsRow {
  user_id: string;
  hands_played: number;
  wins: number;
  vpip: number;
  pfr: number;
  all_in_count: number;
  biggest_pot: number;
  referral_count: number;
  last_updated: Date;
}

function mapStatistics(row: StatisticsRow): Statistics {
  return {
    userId: row.user_id,
    handsPlayed: row.hands_played,
    wins: row.wins,
    vpip: Number(row.vpip),
    pfr: Number(row.pfr),
    allInCount: row.all_in_count,
    biggestPot: row.biggest_pot,
    referralCount: row.referral_count,
    lastUpdated: row.last_updated.toISOString(),
  };
}

export async function findById(userId: string, client?: PoolClient): Promise<Statistics | null> {
  const sql = `SELECT user_id, hands_played, wins, vpip, pfr, all_in_count, biggest_pot, referral_count, last_updated
     FROM statistics
     WHERE user_id = $1`;
  const result = client
    ? await client.query<StatisticsRow>(sql, [userId])
    : await query<StatisticsRow>(sql, [userId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapStatistics(result.rows[0]);
}

export async function findByIdForUpdate(
  userId: string,
  client: PoolClient,
): Promise<Statistics | null> {
  const sql = `SELECT user_id, hands_played, wins, vpip, pfr, all_in_count, biggest_pot, referral_count, last_updated
     FROM statistics
     WHERE user_id = $1
     FOR UPDATE`;
  const result = await client.query<StatisticsRow>(sql, [userId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapStatistics(result.rows[0]);
}

export async function insertIfMissing(stats: Statistics, client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO statistics (user_id, hands_played, wins, vpip, pfr, all_in_count, biggest_pot, referral_count, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id) DO NOTHING`,
    [
      stats.userId,
      stats.handsPlayed,
      stats.wins,
      stats.vpip,
      stats.pfr,
      stats.allInCount,
      stats.biggestPot,
      stats.referralCount,
      new Date(stats.lastUpdated),
    ],
  );
}

export async function upsert(stats: Statistics, client?: PoolClient): Promise<Statistics> {
  const sql = `INSERT INTO statistics (user_id, hands_played, wins, vpip, pfr, all_in_count, biggest_pot, referral_count, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id)
     DO UPDATE SET hands_played = EXCLUDED.hands_played,
                  wins = EXCLUDED.wins,
                  vpip = EXCLUDED.vpip,
                  pfr = EXCLUDED.pfr,
                  all_in_count = EXCLUDED.all_in_count,
                  biggest_pot = EXCLUDED.biggest_pot,
                  referral_count = EXCLUDED.referral_count,
                  last_updated = EXCLUDED.last_updated
     RETURNING user_id, hands_played, wins, vpip, pfr, all_in_count, biggest_pot, referral_count, last_updated`;
  const params = [
    stats.userId,
    stats.handsPlayed,
    stats.wins,
    stats.vpip,
    stats.pfr,
    stats.allInCount,
    stats.biggestPot,
    stats.referralCount,
    new Date(stats.lastUpdated),
  ];
  const result = client
    ? await client.query<StatisticsRow>(sql, params)
    : await query<StatisticsRow>(sql, params);

  return mapStatistics(result.rows[0]);
}

export async function update(stats: Statistics, client?: PoolClient): Promise<Statistics> {
  const sql = `UPDATE statistics
     SET hands_played = $2,
         wins = $3,
         vpip = $4,
         pfr = $5,
         all_in_count = $6,
         biggest_pot = $7,
         referral_count = $8,
         last_updated = $9
     WHERE user_id = $1
     RETURNING user_id, hands_played, wins, vpip, pfr, all_in_count, biggest_pot, referral_count, last_updated`;
  const params = [
    stats.userId,
    stats.handsPlayed,
    stats.wins,
    stats.vpip,
    stats.pfr,
    stats.allInCount,
    stats.biggestPot,
    stats.referralCount,
    new Date(stats.lastUpdated),
  ];
  const result = client
    ? await client.query<StatisticsRow>(sql, params)
    : await query<StatisticsRow>(sql, params);

  return mapStatistics(result.rows[0]);
}
