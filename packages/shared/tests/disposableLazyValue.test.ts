import { describe, expect, it, vi } from 'vitest';

import { createDisposableLazyValue } from '../src/lifecycle/disposableLazyValue';

describe('createDisposableLazyValue', () => {
  it('disposes the cached value and resets', () => {
    const dispose = vi.fn();
    const create = vi.fn(() => ({ id: 1 }));
    const lazy = createDisposableLazyValue(create, dispose);

    expect(lazy.peek()).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(0);

    expect(lazy.get()).toEqual({ id: 1 });
    expect(lazy.peek()).toEqual({ id: 1 });

    lazy.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith({ id: 1 });
    expect(lazy.peek()).toBeUndefined();
  });

  it('does not call disposer when never created', () => {
    const dispose = vi.fn();
    const create = vi.fn(() => ({ created: true }));
    const lazy = createDisposableLazyValue(create, dispose);

    lazy.dispose();

    expect(dispose).toHaveBeenCalledTimes(0);
    expect(create).toHaveBeenCalledTimes(0);
    expect(lazy.peek()).toBeUndefined();
  });

  it('resets even if disposal throws', () => {
    const dispose = vi.fn(() => {
      throw new Error('boom');
    });
    let id = 0;
    const create = vi.fn(() => ({ id: (id += 1) }));
    const lazy = createDisposableLazyValue(create, dispose);

    expect(lazy.get()).toEqual({ id: 1 });
    expect(() => lazy.dispose()).toThrow('boom');
    expect(lazy.peek()).toBeUndefined();

    expect(lazy.get()).toEqual({ id: 2 });
  });
});

