import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../migrations';
const query = vi.fn();
const release = vi.fn();

vi.mock('../pgClient', () => ({
  default: {
    connect: vi.fn(() => ({ query, release })),
  },
}));

describe('migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [] });
  });

  it('runs migrations and commits', async () => {
    await runMigrations();

    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back on error', async () => {
    query.mockImplementationOnce(() => Promise.resolve({ rows: [] }));
    query.mockImplementationOnce(() => Promise.reject(new Error('fail')));

    await expect(runMigrations()).rejects.toThrow('fail');

    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
