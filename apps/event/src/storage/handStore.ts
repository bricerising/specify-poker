import pool from './pgClient';
import { HandRecord } from '../domain/types';

export class HandStore {
  async saveHandRecord(record: HandRecord): Promise<void> {
    await pool.query(
      `INSERT INTO hand_records (
        hand_id, table_id, table_name, config, participants, 
        community_cards, pots, winners, started_at, completed_at, duration_ms
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
        duration_ms = EXCLUDED.duration_ms`,
      [
        record.hand_id, record.table_id, record.table_name, record.config, JSON.stringify(record.participants),
        JSON.stringify(record.community_cards), JSON.stringify(record.pots), JSON.stringify(record.winners),
        record.started_at, record.completed_at, record.duration_ms
      ]
    );
  }

  async getHandRecord(hand_id: string): Promise<HandRecord | null> {
    const res = await pool.query('SELECT * FROM hand_records WHERE hand_id = $1', [hand_id]);
    return res.rows[0] || null;
  }

  async getHandHistory(table_id: string, limit = 20, offset = 0): Promise<{ hands: HandRecord[]; total: number }> {
    const countRes = await pool.query('SELECT COUNT(*) FROM hand_records WHERE table_id = $1', [table_id]);
    const total = parseInt(countRes.rows[0].count);

    const res = await pool.query(
      'SELECT * FROM hand_records WHERE table_id = $1 ORDER BY completed_at DESC LIMIT $2 OFFSET $3',
      [table_id, limit, offset]
    );
    return { hands: res.rows, total };
  }

  async getHandsForUser(user_id: string, limit = 20, offset = 0): Promise<{ hands: HandRecord[]; total: number }> {
    // This requires a more complex query since participants is JSONB
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM hand_records WHERE participants @> $1",
      [JSON.stringify([{ user_id }])]
    );
    const total = parseInt(countRes.rows[0].count);

    const res = await pool.query(
      "SELECT * FROM hand_records WHERE participants @> $1 ORDER BY completed_at DESC LIMIT $2 OFFSET $3",
      [JSON.stringify([{ user_id }]), limit, offset]
    );
    return { hands: res.rows, total };
  }
}

export const handStore = new HandStore();
