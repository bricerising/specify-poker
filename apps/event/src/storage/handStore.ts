import pool from './pgClient';
import type { HandRecord } from '../domain/types';

interface HandRow {
  hand_id: string;
  table_id: string;
  table_name: string;
  config: unknown;
  participants: unknown;
  community_cards: unknown;
  pots: unknown;
  winners: unknown;
  started_at: Date;
  completed_at: Date;
  duration: number;
}

function mapRowToHandRecord(row: HandRow): HandRecord {
  return {
    handId: row.hand_id,
    tableId: row.table_id,
    tableName: row.table_name,
    config: row.config as HandRecord['config'],
    participants: row.participants as HandRecord['participants'],
    communityCards: row.community_cards as HandRecord['communityCards'],
    pots: row.pots as HandRecord['pots'],
    winners: row.winners as HandRecord['winners'],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    duration: row.duration,
  };
}

export class HandStore {
  async saveHandRecord(record: HandRecord): Promise<void> {
    await pool.query(
      `INSERT INTO hand_records (
        hand_id, table_id, table_name, config, participants,
        community_cards, pots, winners, started_at, completed_at, duration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (hand_id) DO UPDATE SET
        table_id = EXCLUDED.table_id,
        table_name = EXCLUDED.table_name,
        config = EXCLUDED.config,
        participants = EXCLUDED.participants,
        community_cards = EXCLUDED.community_cards,
        pots = EXCLUDED.pots,
        winners = EXCLUDED.winners,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        duration = EXCLUDED.duration`,
      [
        record.handId,
        record.tableId,
        record.tableName,
        JSON.stringify(record.config),
        JSON.stringify(record.participants),
        JSON.stringify(record.communityCards),
        JSON.stringify(record.pots),
        JSON.stringify(record.winners),
        record.startedAt,
        record.completedAt,
        record.duration,
      ],
    );
  }

  async getHandRecord(handId: string): Promise<HandRecord | null> {
    const res = await pool.query('SELECT * FROM hand_records WHERE hand_id = $1', [handId]);
    return res.rows[0] ? mapRowToHandRecord(res.rows[0]) : null;
  }

  async getHandHistory(
    tableId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ hands: HandRecord[]; total: number }> {
    const countRes = await pool.query('SELECT COUNT(*) FROM hand_records WHERE table_id = $1', [
      tableId,
    ]);
    const total = parseInt(countRes.rows[0].count, 10);

    const res = await pool.query(
      'SELECT * FROM hand_records WHERE table_id = $1 ORDER BY completed_at DESC LIMIT $2 OFFSET $3',
      [tableId, limit, offset],
    );
    return { hands: res.rows.map(mapRowToHandRecord), total };
  }

  async getHandsForUser(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ hands: HandRecord[]; total: number }> {
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM hand_records WHERE participants @> $1',
      [JSON.stringify([{ userId }])],
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const res = await pool.query(
      'SELECT * FROM hand_records WHERE participants @> $1 ORDER BY completed_at DESC LIMIT $2 OFFSET $3',
      [JSON.stringify([{ userId }]), limit, offset],
    );
    return { hands: res.rows.map(mapRowToHandRecord), total };
  }
}

export const handStore = new HandStore();
