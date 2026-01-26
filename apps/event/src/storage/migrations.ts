import pool from "./pgClient";
import logger from "../observability/logger";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        event_id UUID,
        type VARCHAR(50) NOT NULL,
        table_id VARCHAR(255) NOT NULL,
        hand_id VARCHAR(255),
        user_id VARCHAR(255),
        seat_id SMALLINT,
        payload JSONB NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sequence INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (event_id, timestamp)
      ) PARTITION BY RANGE (timestamp);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS events_default
      PARTITION OF events DEFAULT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS event_idempotency (
        idempotency_key VARCHAR(255) PRIMARY KEY,
        event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hand_records (
        hand_id VARCHAR(255) PRIMARY KEY,
        table_id VARCHAR(255) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        config JSONB NOT NULL,
        participants JSONB NOT NULL,
        community_cards JSONB NOT NULL,
        pots JSONB NOT NULL,
        winners JSONB NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ NOT NULL,
        duration INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cursors (
        cursor_id VARCHAR(255) PRIMARY KEY,
        stream_id VARCHAR(255) NOT NULL,
        subscriber_id VARCHAR(255) NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(stream_id, subscriber_id)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_table ON events(table_id, timestamp);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_hand ON events(hand_id, sequence) WHERE hand_id IS NOT NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, timestamp) WHERE user_id IS NOT NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, timestamp);`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_hand_records_table ON hand_records(table_id, completed_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hand_records_participants ON hand_records USING GIN ((participants));`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_cursors_stream ON cursors(stream_id);`);

    await client.query("COMMIT");
    logger.info("Migrations completed successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ error: err }, "Migration failed");
    throw err;
  } finally {
    client.release();
  }
}
