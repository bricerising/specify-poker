import { describe, expect, it, vi } from 'vitest';

import { createDisposableLazyProxy } from '../src/lifecycle/disposableLazyProxy';

describe('createDisposableLazyProxy', () => {
  it('creates lazily and delegates via proxy (with correct this binding)', () => {
    const create = vi.fn(() => ({
      value: 1,
      next(this: { value: number }) {
        return this.value + 1;
      },
    }));
    const dispose = vi.fn();

    const lazy = createDisposableLazyProxy(create, dispose);

    expect(create).toHaveBeenCalledTimes(0);
    expect(lazy.proxy.next()).toBe(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('disposes the cached value and allows recreation', () => {
    let id = 0;
    const create = vi.fn(() => ({ id: (id += 1) }));
    const dispose = vi.fn();

    const lazy = createDisposableLazyProxy(create, dispose);

    expect(lazy.get()).toEqual({ id: 1 });
    lazy.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith({ id: 1 });

    expect(lazy.get()).toEqual({ id: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('is non-thenable to avoid await-proxy footguns', () => {
    const create = vi.fn(() => ({ ok: true }));
    const dispose = vi.fn();
    const lazy = createDisposableLazyProxy(create, dispose);

    expect((lazy.proxy as unknown as { then?: unknown }).then).toBeUndefined();
    expect(lazy.proxy.ok).toBe(true);
  });
});
