import { describe, expect, it, vi } from 'vitest';
import { createConfigAccessors } from '../src/config';

describe('createConfigAccessors', () => {
  it('caches the loaded config', () => {
    const loadConfig = vi.fn(() => ({ port: 123 }));

    const accessors = createConfigAccessors(loadConfig);

    expect(accessors.getConfig()).toEqual({ port: 123 });
    expect(accessors.getConfig()).toEqual({ port: 123 });
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  it('resets the cached config for tests', () => {
    const loadConfig = vi.fn(() => ({ token: Math.random() }));

    const accessors = createConfigAccessors(loadConfig);

    const first = accessors.getConfig();
    accessors.resetConfigForTests();
    const second = accessors.getConfig();

    expect(first).not.toEqual(second);
    expect(loadConfig).toHaveBeenCalledTimes(2);
  });
});

