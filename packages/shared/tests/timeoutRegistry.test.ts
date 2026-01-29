import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeoutRegistry } from '../src';

describe('TimeoutRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears an existing timeout when overwritten', () => {
    const registry = new TimeoutRegistry<string>();
    const calls: string[] = [];

    registry.set(
      'table-1',
      setTimeout(() => {
        calls.push('first');
      }, 10),
    );

    registry.set(
      'table-1',
      setTimeout(() => {
        calls.push('second');
      }, 10),
    );

    vi.advanceTimersByTime(10);
    expect(calls).toEqual(['second']);
  });

  it('clears a timeout on delete', () => {
    const registry = new TimeoutRegistry<string>();
    const calls: string[] = [];

    registry.set(
      'table-1',
      setTimeout(() => {
        calls.push('fired');
      }, 10),
    );

    expect(registry.delete('table-1')).toBe(true);
    vi.advanceTimersByTime(10);
    expect(calls).toEqual([]);
  });

  it('clears all timeouts on clear', () => {
    const registry = new TimeoutRegistry<string>();
    const calls: string[] = [];

    registry.set(
      'table-1',
      setTimeout(() => {
        calls.push('a');
      }, 10),
    );
    registry.set(
      'table-2',
      setTimeout(() => {
        calls.push('b');
      }, 10),
    );

    registry.clear();
    vi.advanceTimersByTime(10);
    expect(calls).toEqual([]);
    expect(registry.size).toBe(0);
  });
});

