import { describe, expect, it, vi } from 'vitest';

import { createShutdownManager } from '../shutdown';
import { createOtelBootstrapStep } from '../otelBootstrapStep';
import type { ServiceBootstrapContext } from '../serviceBootstrap';

describe('createOtelBootstrapStep', () => {
  it('starts and registers shutdown stop', async () => {
    const events: string[] = [];

    const shutdown = createShutdownManager();
    const ctx: ServiceBootstrapContext = {
      shutdown,
      onShutdown: (name, action) => shutdown.add(name, action),
      state: {},
    };

    const step = createOtelBootstrapStep({
      start: () => {
        events.push('start');
      },
      stop: () => {
        events.push('stop');
      },
    });

    await step(ctx);
    expect(events).toEqual(['start']);

    await shutdown.run();
    expect(events).toEqual(['start', 'stop']);
  });

  it('is a no-op when disabled', async () => {
    const events: string[] = [];

    const shutdown = createShutdownManager();
    const ctx: ServiceBootstrapContext = {
      shutdown,
      onShutdown: (name, action) => shutdown.add(name, action),
      state: {},
    };

    const step = createOtelBootstrapStep({
      isEnabled: () => false,
      start: () => {
        events.push('start');
      },
      stop: () => {
        events.push('stop');
      },
    });

    await step(ctx);
    await shutdown.run();

    expect(events).toEqual([]);
  });

  it('best-effort stops when start throws and does not register shutdown', async () => {
    const events: string[] = [];

    const shutdown = createShutdownManager();
    const ctx: ServiceBootstrapContext = {
      shutdown,
      onShutdown: (name, action) => shutdown.add(name, action),
      state: {},
    };

    const step = createOtelBootstrapStep({
      start: () => {
        events.push('start');
        throw new Error('start.failed');
      },
      stop: () => {
        events.push('stop');
      },
    });

    await expect(step(ctx)).rejects.toThrow('start.failed');
    expect(events).toEqual(['start', 'stop']);

    await shutdown.run();
    expect(events).toEqual(['start', 'stop']);
  });

  it('reports stop failures after start failure', async () => {
    const shutdown = createShutdownManager();
    const ctx: ServiceBootstrapContext = {
      shutdown,
      onShutdown: (name, action) => shutdown.add(name, action),
      state: {},
    };

    const onStopAfterStartError = vi.fn();

    const step = createOtelBootstrapStep({
      start: () => {
        throw new Error('start.failed');
      },
      stop: () => {
        throw new Error('stop.failed');
      },
      onStopAfterStartError,
    });

    await expect(step(ctx)).rejects.toThrow('start.failed');
    expect(onStopAfterStartError).toHaveBeenCalledTimes(1);
    expect(onStopAfterStartError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});
