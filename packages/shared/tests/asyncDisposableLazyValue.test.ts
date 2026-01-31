import { describe, expect, it, vi } from 'vitest';

import { createAsyncDisposableLazyValue } from '../src/lifecycle/asyncDisposableLazyValue';

describe('createAsyncDisposableLazyValue', () => {
  it('disposes the cached value and resets', async () => {
    const dispose = vi.fn(async () => {});
    const create = vi.fn(() => ({ id: 1 }));
    const lazy = createAsyncDisposableLazyValue(create, dispose);

    expect(lazy.peek()).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(0);

    expect(lazy.get()).toEqual({ id: 1 });
    expect(lazy.peek()).toEqual({ id: 1 });

    await lazy.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith({ id: 1 });
    expect(lazy.peek()).toBeUndefined();
  });

  it('does not call disposer when never created', async () => {
    const dispose = vi.fn(async () => {});
    const create = vi.fn(() => ({ created: true }));
    const lazy = createAsyncDisposableLazyValue(create, dispose);

    await lazy.dispose();

    expect(dispose).toHaveBeenCalledTimes(0);
    expect(create).toHaveBeenCalledTimes(0);
    expect(lazy.peek()).toBeUndefined();
  });

  it('resets even if disposal throws', async () => {
    const dispose = vi.fn(async () => {
      throw new Error('boom');
    });
    let id = 0;
    const create = vi.fn(() => ({ id: (id += 1) }));
    const lazy = createAsyncDisposableLazyValue(create, dispose);

    expect(lazy.get()).toEqual({ id: 1 });
    await expect(lazy.dispose()).rejects.toThrow('boom');
    expect(lazy.peek()).toBeUndefined();

    expect(lazy.get()).toEqual({ id: 2 });
  });

  it('coalesces concurrent dispose calls', async () => {
    let resolveDispose: (() => void) | undefined;
    const dispose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDispose = resolve;
        }),
    );
    const create = vi.fn(() => ({ id: 1 }));
    const lazy = createAsyncDisposableLazyValue(create, dispose);

    lazy.get();

    const promiseA = lazy.dispose();
    const promiseB = lazy.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);

    resolveDispose?.();
    await Promise.all([promiseA, promiseB]);

    expect(lazy.peek()).toBeUndefined();
  });
});

