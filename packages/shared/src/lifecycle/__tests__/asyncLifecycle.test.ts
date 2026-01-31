import { describe, expect, it } from 'vitest';

import { createAsyncLifecycle } from '../asyncLifecycle';

describe('createAsyncLifecycle', () => {
  it('returns to stopped when start throws synchronously', async () => {
    const lifecycle = createAsyncLifecycle({
      start: async () => undefined,
      stop: async () => undefined,
    });

    const lifecycleWithSyncThrow = createAsyncLifecycle({
      start: (): Promise<void> => {
        throw new Error('start.failed');
      },
      stop: async () => undefined,
    });

    expect(lifecycle.getStatus()).toBe('stopped');
    await lifecycle.start();
    expect(lifecycle.getStatus()).toBe('running');
    await lifecycle.stop();
    expect(lifecycle.getStatus()).toBe('stopped');

    expect(lifecycleWithSyncThrow.getStatus()).toBe('stopped');
    await expect(lifecycleWithSyncThrow.start()).rejects.toThrow('start.failed');
    expect(lifecycleWithSyncThrow.getStatus()).toBe('stopped');
  });

  it('returns to stopped when stop throws synchronously', async () => {
    const lifecycle = createAsyncLifecycle({
      start: async () => undefined,
      stop: (): Promise<void> => {
        throw new Error('stop.failed');
      },
    });

    await lifecycle.start();
    expect(lifecycle.getStatus()).toBe('running');

    await expect(lifecycle.stop()).rejects.toThrow('stop.failed');
    expect(lifecycle.getStatus()).toBe('stopped');
  });
});

