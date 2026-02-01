import { describe, it, expect, beforeEach, vi } from 'vitest';

const connect = vi.fn();
const query = vi.fn();
const release = vi.fn();

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => ['001_initial.sql', '002_add_username.sql']),
  readFileSync: vi.fn(() => 'SELECT 1;'),
  default: {
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => ['001_initial.sql', '002_add_username.sql']),
    readFileSync: vi.fn(() => 'SELECT 1;'),
  },
}));

vi.mock('../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/storage/db', () => ({
  default: {
    connect: () => connect(),
  },
}));

describe('migrations runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue({ query, release });
  });

  it('retries the database connection before running migrations', async () => {
    const failingConnect = vi
      .fn()
      .mockRejectedValueOnce(new Error('db not ready'))
      .mockRejectedValueOnce(new Error('still not ready'))
      .mockResolvedValue({ query: vi.fn(), release: vi.fn() });

    let nowMs = 0;
    const clock = {
      now: () => nowMs,
      sleep: async (ms: number) => {
        nowMs += ms;
      },
    };

    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const { createMigrationsRunner } = await import('../../src/storage/migrations');

    const runner = createMigrationsRunner({
      env: {},
      pool: { connect: failingConnect },
      logger,
      clock,
      migrationsDir: '/migrations',
      retryConfig: { timeoutMs: 1000, baseDelayMs: 100, maxDelayMs: 200 },
      fs: {
        existsSync: vi.fn(() => true),
        readdirSync: vi.fn(() => []),
        readFileSync: vi.fn(() => ''),
      },
      path: {
        resolve: vi.fn(() => '/migrations'),
        join: vi.fn(() => '/migrations/001_initial.sql'),
      },
    });

    await runner.runMigrations();

    expect(failingConnect).toHaveBeenCalledTimes(3);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('runs migrations successfully', async () => {
    const { runMigrations } = await import('../../src/storage/migrations');

    await runMigrations();

    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(912345678)');
    expect(query).toHaveBeenCalledWith('SELECT name FROM schema_migrations ORDER BY name ASC');
    expect(query).toHaveBeenCalledWith('SELECT 1;');
    expect(query).toHaveBeenCalledWith('INSERT INTO schema_migrations (name) VALUES ($1)', [
      '001_initial.sql',
    ]);
    expect(query).toHaveBeenCalledWith('INSERT INTO schema_migrations (name) VALUES ($1)', [
      '002_add_username.sql',
    ]);
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('rolls back on migration failure', async () => {
    query.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const { runMigrations } = await import('../../src/storage/migrations');

    await expect(runMigrations()).rejects.toThrow('boom');

    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });
});
