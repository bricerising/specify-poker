import { describe, expect, it, vi } from 'vitest';

import { createPgPoolManager } from '../src/pg/pgPoolManager';

describe('createPgPoolManager', () => {
  it('does not create a pool until first use', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
      connect: vi.fn(async () => ({ release: vi.fn() })),
      end: vi.fn(async () => {}),
    };
    const createPool = vi.fn(() => pool);

    const manager = createPgPoolManager({
      connectionString: 'postgresql://example',
      createPool: createPool as unknown as (config: unknown) => never,
    });

    expect(createPool).toHaveBeenCalledTimes(0);

    await manager.query('SELECT 1', []);

    expect(createPool).toHaveBeenCalledTimes(1);
  });

  it('does not create a pool when closed before use', async () => {
    const createPool = vi.fn(() => ({
      query: vi.fn(async () => ({ rows: [] })),
      connect: vi.fn(async () => ({ release: vi.fn() })),
      end: vi.fn(async () => {}),
    }));

    const manager = createPgPoolManager({
      connectionString: 'postgresql://example',
      createPool: createPool as unknown as (config: unknown) => never,
    });

    await manager.close();

    expect(createPool).toHaveBeenCalledTimes(0);
  });

  it('forwards query calls to the pool', async () => {
    const poolQuery = vi.fn(async () => ({ rows: [] }));
    const pool = {
      query: poolQuery,
      connect: vi.fn(async () => ({ release: vi.fn() })),
      end: vi.fn(async () => {}),
    };
    const createPool = vi.fn(() => pool);

    const manager = createPgPoolManager({
      connectionString: 'postgresql://example',
      createPool: createPool as unknown as (config: unknown) => never,
    });

    await manager.query('SELECT 1', ['a', 1]);

    expect(poolQuery).toHaveBeenCalledWith('SELECT 1', ['a', 1]);
  });

  it('closes the pool and allows re-creation', async () => {
    const poolEnd = vi.fn(async () => {});
    const createPool = vi
      .fn()
      .mockReturnValueOnce({
        query: vi.fn(async () => ({ rows: [] })),
        connect: vi.fn(async () => ({ release: vi.fn() })),
        end: poolEnd,
      })
      .mockReturnValueOnce({
        query: vi.fn(async () => ({ rows: [] })),
        connect: vi.fn(async () => ({ release: vi.fn() })),
        end: vi.fn(async () => {}),
      });

    const manager = createPgPoolManager({
      connectionString: 'postgresql://example',
      createPool: createPool as unknown as (config: unknown) => never,
    });

    await manager.query('SELECT 1', []);
    await manager.close();
    await manager.query('SELECT 1', []);

    expect(poolEnd).toHaveBeenCalledTimes(1);
    expect(createPool).toHaveBeenCalledTimes(2);
  });

  it('logs pool error events when supported', async () => {
    let onError: ((err: unknown) => void) | null = null;
    const logger = { error: vi.fn() };
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
      connect: vi.fn(async () => ({ release: vi.fn() })),
      end: vi.fn(async () => {}),
      on: vi.fn((event: string, handler: (err: unknown) => void) => {
        if (event === 'error') {
          onError = handler;
        }
        return pool;
      }),
    };
    const createPool = vi.fn(() => pool);

    const manager = createPgPoolManager({
      connectionString: 'postgresql://example',
      createPool: createPool as unknown as (config: unknown) => never,
      log: logger,
      name: 'test',
    });

    await manager.query('SELECT 1', []);

    const err = new Error('boom');
    onError?.(err);

    expect(logger.error).toHaveBeenCalledWith({ err, name: 'test' }, 'pg.pool.error');
  });
});

