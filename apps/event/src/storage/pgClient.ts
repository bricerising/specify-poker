import { createAsyncDisposableLazyValue } from '@specify-poker/shared';
import { createPgPoolManager, type PgPool } from '@specify-poker/shared/pg';
import { getConfig } from '../config';
import logger from '../observability/logger';

type PgManager = ReturnType<typeof createPgPoolManager>;

const defaultPgManager = createAsyncDisposableLazyValue<PgManager>(
  () => {
    const config = getConfig();
    return createPgPoolManager({
      connectionString: config.databaseUrl,
      log: logger,
      name: 'event-db',
    });
  },
  (manager) => manager.close(),
);

const pool: PgPool = {
  query: (text, params) => defaultPgManager.get().query(text, params),
  connect: () => defaultPgManager.get().connect(),
  end: () => defaultPgManager.dispose(),
};

export const query = (text: string, params?: unknown[]) => pool.query(text, params);

export const getClient = () => pool.connect();

export function closePgPool(): Promise<void> {
  return defaultPgManager.dispose();
}

export function resetPgPoolForTests(): void {
  defaultPgManager.reset();
}

export default pool;
