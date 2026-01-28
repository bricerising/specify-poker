import fs from 'fs';
import path from 'path';
import pool from './db';
import logger from '../observability/logger';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry() {
  const timeoutMs = Number(process.env.PLAYER_DB_CONNECT_TIMEOUT_MS ?? 120_000);
  const baseDelayMs = Number(process.env.PLAYER_DB_CONNECT_RETRY_MS ?? 500);
  const maxDelayMs = Number(process.env.PLAYER_DB_CONNECT_MAX_RETRY_MS ?? 5_000);

  const startedAt = Date.now();
  let attempt = 0;
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    try {
      const client = await pool.connect();
      if (attempt > 1) {
        logger.info({ attempt }, 'Database connection established');
      }
      return client;
    } catch (err) {
      lastError = err;
      const elapsedMs = Date.now() - startedAt;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * attempt, timeoutMs - elapsedMs);
      logger.info({ err, attempt, delayMs }, 'Database not ready; retrying');
      await sleep(delayMs);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  logger.error({ err: lastError, attempt, elapsedMs }, 'Database connection timed out');
  throw lastError instanceof Error ? lastError : new Error('Database connection timed out');
}

export async function runMigrations() {
  const client = await connectWithRetry();
  try {
    logger.info('Running database migrations...');

    const migrationsDir = path.resolve(__dirname, '../../migrations');
    logger.info({ path: migrationsDir }, 'Loading migration directory');

    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at ${migrationsDir}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      logger.info({ path: migrationsDir }, 'No migration files found');
      return;
    }

    await client.query('BEGIN');
    for (const file of files) {
      const migrationFile = path.join(migrationsDir, file);
      logger.info({ path: migrationFile }, 'Running migration file');
      const sql = fs.readFileSync(migrationFile, 'utf8');
      await client.query(sql);
    }
    await client.query('COMMIT');

    logger.info('Migrations completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Migration failed');
    throw err;
  } finally {
    client.release();
  }
}
