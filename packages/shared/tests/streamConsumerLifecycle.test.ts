import { describe, expect, it, vi } from 'vitest';

import { createRedisStreamConsumerLifecycle } from '../src/redis/streamConsumerLifecycle';

describe('createRedisStreamConsumerLifecycle', () => {
  it('starts and stops a consumer loop', async () => {
    const getClient = vi.fn(async () => {
      throw new Error('not_used');
    });

    const closeClient = vi.fn(async () => undefined);

    const runConsumer = vi.fn(
      async (signal: AbortSignal): Promise<void> =>
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    );

    const lifecycle = createRedisStreamConsumerLifecycle({
      streamKey: 'events:all',
      groupName: 'group',
      consumerName: 'consumer',
      getClient,
      closeClient,
      onMessage: async () => undefined,
      runConsumer,
      sleep: async () => undefined,
    });

    expect(lifecycle.isRunning()).toBe(false);

    await lifecycle.start();
    expect(runConsumer).toHaveBeenCalledTimes(1);
    expect(lifecycle.isRunning()).toBe(true);

    await lifecycle.stop();
    expect(closeClient).toHaveBeenCalledTimes(1);
    expect(lifecycle.isRunning()).toBe(false);
  });

  it('does not start when disabled', async () => {
    const runConsumer = vi.fn(async () => undefined);

    const lifecycle = createRedisStreamConsumerLifecycle({
      enabled: false,
      streamKey: 'events:all',
      groupName: 'group',
      consumerName: 'consumer',
      getClient: async () => {
        throw new Error('not_used');
      },
      onMessage: async () => undefined,
      runConsumer,
      sleep: async () => undefined,
    });

    await lifecycle.start();
    expect(runConsumer).not.toHaveBeenCalled();
    expect(lifecycle.isRunning()).toBe(false);
  });
});

