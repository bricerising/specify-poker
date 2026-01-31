import { createAsyncDisposableLazyValue } from '@specify-poker/shared';
import { createPgPoolManager, type PgPool } from '@specify-poker/shared/pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getConfig } from '../config';
import logger from '../observability/logger';

type PgManager = ReturnType<typeof createPgPoolManager>;

const defaultPgManager = createAsyncDisposableLazyValue<PgManager>(
  () => {
    const config = getConfig();
    return createPgPoolManager({
      connectionString: config.databaseUrl,
      log: logger,
      name: 'player-db',
    });
  },
  (manager) => manager.close(),
);

const pool: PgPool = {
  query: (text, params) => defaultPgManager.get().query(text, params),
  connect: () => defaultPgManager.get().connect(),
  end: () => defaultPgManager.dispose(),
};

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: unknown) {
      logger.error({ err: rollbackError }, 'Postgres transaction rollback failed');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await defaultPgManager.dispose();
}

export function resetDbForTests(): void {
  defaultPgManager.reset();
}

export default pool;
