import type { PoolClient } from 'pg';
import { query } from './db';
import { decodeStatistics } from '../domain/decoders';
import type { Statistics } from '../domain/types';

type StatisticsIdempotencyRow = {
  result: unknown | null;
};

export async function lockAndGetResult(
  idempotencyKey: string,
  client: PoolClient,
): Promise<Statistics | null> {
  const sql = `SELECT result FROM statistics_idempotency WHERE idempotency_key = $1 FOR UPDATE`;
  const result = await client.query<StatisticsIdempotencyRow>(sql, [idempotencyKey]);
  const row = result.rows[0];
  if (!row || row.result === null) {
    return null;
  }
  return decodeStatistics(row.result);
}

export async function insertIfMissing(params: {
  idempotencyKey: string;
  userId: string;
  statisticType: string;
  amount: number;
  client?: PoolClient;
}): Promise<void> {
  const run = params.client ? params.client.query.bind(params.client) : query;
  await run(
    `INSERT INTO statistics_idempotency (idempotency_key, user_id, statistic_type, amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [params.idempotencyKey, params.userId, params.statisticType, params.amount],
  );
}

export async function setResult(
  params: {
    idempotencyKey: string;
    result: Statistics;
  },
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE statistics_idempotency
     SET result = $2,
         updated_at = NOW()
     WHERE idempotency_key = $1`,
    [params.idempotencyKey, params.result],
  );
}

