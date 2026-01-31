import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export type PgPoolLogFn = (obj: Record<string, unknown>, msg: string) => void;

export type PgPoolLogger = {
  info?: PgPoolLogFn;
  warn?: PgPoolLogFn;
  error?: PgPoolLogFn;
};

export type PgPool = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
};

export type PgPoolManager = PgPool & {
  isInitialized(): boolean;
  close(): Promise<void>;
};

type CreatePgPoolManagerOptions = {
  connectionString: string;
  poolConfig?: Omit<PoolConfig, 'connectionString'>;
  createPool?: (config: PoolConfig) => Pool;
  log?: PgPoolLogger;
  name?: string;
};

export function createPgPoolManager(options: CreatePgPoolManagerOptions): PgPoolManager {
  const name = options.name ?? 'pg';
  const poolConfig: PoolConfig = {
    ...options.poolConfig,
    connectionString: options.connectionString,
  };
  const createPool = options.createPool ?? ((config: PoolConfig) => new Pool(config));
  const log = options.log;

  let pool: Pool | null = null;
  let closePromise: Promise<void> | null = null;

  const logError = (obj: Record<string, unknown>, msg: string) => {
    const fn = log?.error ?? log?.warn;
    if (!fn) return;
    fn.call(log, obj, msg);
  };

  const getPool = (): Pool => {
    if (pool) {
      return pool;
    }

    const nextPool = createPool(poolConfig);

    const on = (nextPool as unknown as { on?: unknown }).on;
    if (typeof on === 'function') {
      on.call(nextPool, 'error', (err: unknown) => {
        logError({ err, name }, 'pg.pool.error');
      });
    }

    pool = nextPool;
    return nextPool;
  };

  const close = async (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      const current = pool;
      if (!current) {
        return;
      }

      try {
        await current.end();
      } finally {
        pool = null;
      }
    })().finally(() => {
      closePromise = null;
    });

    return closePromise;
  };

  const query = <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>> => {
    return getPool().query(text, params ? [...params] : undefined);
  };

  const connect = (): Promise<PoolClient> => {
    return getPool().connect();
  };

  return {
    isInitialized: () => pool !== null,
    query,
    connect,
    close,
    end: close,
  };
}

