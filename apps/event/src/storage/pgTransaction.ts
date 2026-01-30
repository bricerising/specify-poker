import type { PoolClient } from 'pg';

export type PgPool = {
  connect(): Promise<PoolClient>;
};

export type PgLogger = {
  error(obj: unknown, msg?: string): void;
};

export type WithPgTransactionOptions = {
  logger?: PgLogger;
  name?: string;
};

export async function withPgTransaction<T>(
  pool: PgPool,
  run: (client: PoolClient) => Promise<T>,
  options: WithPgTransactionOptions = {},
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: unknown) {
      options.logger?.error(
        { err: rollbackError, op: options.name },
        'Postgres transaction rollback failed',
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

