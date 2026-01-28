import { describe, expect, it, vi } from 'vitest';

import { createBoundTargetProxy } from '../src/proxy/boundTargetProxy';

describe('createBoundTargetProxy', () => {
  it('lazily reads properties from the latest target', () => {
    const target = { value: 123 };
    const getTarget = vi.fn(() => target);
    const proxy = createBoundTargetProxy(getTarget);

    expect(getTarget).toHaveBeenCalledTimes(0);
    expect((proxy as { value: number }).value).toBe(123);
    expect(getTarget).toHaveBeenCalledTimes(1);
  });

  it('binds function properties to preserve this', () => {
    const target = {
      value: 123,
      getValue() {
        return this.value;
      },
    };

    const proxy = createBoundTargetProxy(() => target);
    const fn = (proxy as { getValue: () => number }).getValue;
    expect(fn()).toBe(123);
  });

  it('is not thenable', () => {
    const proxy = createBoundTargetProxy(() => ({ value: 1 }));
    expect((proxy as { then?: unknown }).then).toBeUndefined();
  });
});
