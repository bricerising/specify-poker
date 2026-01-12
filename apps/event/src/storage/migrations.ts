import pool from './pgClient';

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS game_events (
        event_id UUID PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        table_id UUID NOT NULL,
        hand_id UUID,
        user_id UUID,
        seat_id INTEGER,
        payload JSONB NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sequence SERIAL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hand_records (
        hand_id UUID PRIMARY KEY,
        table_id UUID NOT NULL,
        table_name VARCHAR(100),
        config JSONB NOT NULL,
        participants JSONB NOT NULL,
        community_cards JSONB NOT NULL,
        pots JSONB NOT NULL,
        winners JSONB NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL,
        completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
        duration_ms INTEGER NOT NULL
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_table_id ON game_events(table_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_hand_id ON game_events(hand_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_user_id ON game_events(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON game_events(timestamp);`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_hands_table_id ON hand_records(table_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hands_completed_at ON hand_records(completed_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hands_participants_gin ON hand_records USING GIN (participants);`);

    await client.query('COMMIT');
    console.log('Migrations completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}
