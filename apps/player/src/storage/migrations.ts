import fs from 'fs';
import path from 'path';
import { readIntEnv, type Env } from '@specify-poker/shared';
import pool from './db';
import logger from '../observability/logger';

type Logger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

type DbClient = {
  query: (text: string) => Promise<unknown>;
  release: () => void;
};

type DbPool = {
  connect: () => Promise<DbClient>;
};

type Clock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

type DbConnectRetryConfig = {
  timeoutMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type MigrationsRunnerDeps = {
  env: Env;
  pool: DbPool;
  logger: Logger;
  fs: Pick<typeof fs, 'existsSync' | 'readdirSync' | 'readFileSync'>;
  path: Pick<typeof path, 'resolve' | 'join'>;
  clock?: Clock;
  migrationsDir?: string;
  retryConfig?: DbConnectRetryConfig;
};

export type MigrationsRunner = {
  runMigrations: () => Promise<void>;
};

const defaultClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function loadDbConnectRetryConfig(env: Env): DbConnectRetryConfig {
  return {
    timeoutMs: readIntEnv(env, 'PLAYER_DB_CONNECT_TIMEOUT_MS', 120_000, { min: 0 }),
    baseDelayMs: readIntEnv(env, 'PLAYER_DB_CONNECT_RETRY_MS', 500, { min: 0 }),
    maxDelayMs: readIntEnv(env, 'PLAYER_DB_CONNECT_MAX_RETRY_MS', 5_000, { min: 0 }),
  };
}

function createDbConnectorWithRetry(options: {
  pool: DbPool;
  logger: Logger;
  retryConfig: DbConnectRetryConfig;
  clock: Clock;
}): { connect: () => Promise<DbClient> } {
  return {
    connect: async () => {
      const { timeoutMs, baseDelayMs, maxDelayMs } = options.retryConfig;

      const startedAt = options.clock.now();
      let attempt = 0;
      let lastError: unknown = null;

      while (options.clock.now() - startedAt < timeoutMs) {
        attempt += 1;
        try {
          const client = await options.pool.connect();
          if (attempt > 1) {
            options.logger.info({ attempt }, 'Database connection established');
          }
          return client;
        } catch (err) {
          lastError = err;
          const elapsedMs = options.clock.now() - startedAt;
          const remainingMs = Math.max(0, timeoutMs - elapsedMs);
          const delayMs = Math.min(maxDelayMs, baseDelayMs * attempt, remainingMs);
          options.logger.info({ err, attempt, delayMs }, 'Database not ready; retrying');
          await options.clock.sleep(delayMs);
        }
      }

      const elapsedMs = options.clock.now() - startedAt;
      options.logger.error({ err: lastError, attempt, elapsedMs }, 'Database connection timed out');
      throw lastError instanceof Error ? lastError : new Error('Database connection timed out');
    },
  };
}

export function createMigrationsRunner(deps: MigrationsRunnerDeps): MigrationsRunner {
  const clock = deps.clock ?? defaultClock;
  const retryConfig = deps.retryConfig ?? loadDbConnectRetryConfig(deps.env);
  const migrationsDir = deps.migrationsDir ?? deps.path.resolve(__dirname, '../../migrations');
  const connector = createDbConnectorWithRetry({
    pool: deps.pool,
    logger: deps.logger,
    retryConfig,
    clock,
  });

  return {
    runMigrations: async () => {
      const client = await connector.connect();
      try {
        deps.logger.info({}, 'Running database migrations...');

        deps.logger.info({ path: migrationsDir }, 'Loading migration directory');

        if (!deps.fs.existsSync(migrationsDir)) {
          throw new Error(`Migrations directory not found at ${migrationsDir}`);
        }

        const files = deps.fs
          .readdirSync(migrationsDir)
          .filter((file) => file.endsWith('.sql'))
          .sort((a, b) => a.localeCompare(b));

        if (files.length === 0) {
          deps.logger.info({ path: migrationsDir }, 'No migration files found');
          return;
        }

        await client.query('BEGIN');
        for (const file of files) {
          const migrationFile = deps.path.join(migrationsDir, file);
          deps.logger.info({ path: migrationFile }, 'Running migration file');
          const sql = deps.fs.readFileSync(migrationFile, 'utf8');
          await client.query(sql);
        }
        await client.query('COMMIT');

        deps.logger.info({}, 'Migrations completed successfully');
      } catch (err: unknown) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError: unknown) {
          deps.logger.error({ err: rollbackError }, 'Migration rollback failed');
        }
        deps.logger.error({ err }, 'Migration failed');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export async function runMigrations(): Promise<void> {
  await createMigrationsRunner({ env: process.env, pool, logger, fs, path }).runMigrations();
}
