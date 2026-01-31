import { describe, expect, it, vi } from 'vitest';

import { createServiceBootstrapBuilder } from '../serviceBootstrap';

describe('createServiceBootstrapBuilder', () => {
  it('runs steps, then run, then shutdown actions in reverse order', async () => {
    const events: string[] = [];

    const bootstrap = createServiceBootstrapBuilder({})
      .step('a', ({ onShutdown }) => {
        events.push('step.a');
        onShutdown('a.stop', () => {
          events.push('stop.a');
        });
      })
      .step('b', ({ onShutdown }) => {
        events.push('step.b');
        onShutdown('b.stop', () => {
          events.push('stop.b');
        });
      })
      .build({
        run: async () => {
          events.push('run');
        },
      });

    await bootstrap.main();
    expect(events).toEqual(['step.a', 'step.b', 'run']);

    await bootstrap.shutdown();
    expect(events).toEqual(['step.a', 'step.b', 'run', 'stop.b', 'stop.a']);
  });

  it('shares state added by stepWithState', async () => {
    const bootstrap = createServiceBootstrapBuilder({})
      .stepWithState('state.add', async () => ({ value: 123 }))
      .build({
        run: async ({ state }) => {
          expect(state.value).toBe(123);
        },
      });

    await bootstrap.main();
    await bootstrap.shutdown();
  });

  it('runs shutdown when a step fails and marks service as not running', async () => {
    const events: string[] = [];
    const logger = { error: vi.fn() };

    const bootstrap = createServiceBootstrapBuilder({ logger, serviceName: 'test' })
      .step('a', ({ onShutdown }) => {
        onShutdown('a.stop', () => {
          events.push('stop.a');
        });
      })
      .step('boom', () => {
        throw new Error('boom');
      })
      .build({
        run: async () => {
          events.push('run');
        },
      });

    await expect(bootstrap.main()).rejects.toThrow('boom');
    expect(events).toEqual(['stop.a']);
    expect(bootstrap.isRunning()).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('throws when started twice in throw mode', async () => {
    const bootstrap = createServiceBootstrapBuilder({})
      .build({
        run: async () => undefined,
        onStartWhileRunning: 'throw',
      });

    await bootstrap.main();
    await expect(bootstrap.main()).rejects.toThrow('Service is already running');
    await bootstrap.shutdown();
  });
});

