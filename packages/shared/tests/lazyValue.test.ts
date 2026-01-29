import { describe, expect, it, vi } from 'vitest';

import { createLazyValue } from '../src/lifecycle/lazyValue';

describe('createLazyValue', () => {
  it('lazily creates the value on first get', () => {
    const create = vi.fn(() => ({ created: true }));
    const lazy = createLazyValue(create);

    expect(create).toHaveBeenCalledTimes(0);
    expect(lazy.peek()).toBeUndefined();

    expect(lazy.get()).toEqual({ created: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(lazy.peek()).toEqual({ created: true });
  });

  it('caches the value until reset', () => {
    let id = 0;
    const create = vi.fn(() => ({ id: (id += 1) }));
    const lazy = createLazyValue(create);

    expect(lazy.get()).toEqual({ id: 1 });
    expect(lazy.get()).toEqual({ id: 1 });
    expect(create).toHaveBeenCalledTimes(1);

    lazy.reset();

    expect(lazy.peek()).toBeUndefined();
    expect(lazy.get()).toEqual({ id: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
