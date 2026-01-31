import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventConsumer } from '../../src/services/eventConsumer';
import { createGameEventHandlers } from '../../src/services/gameEventHandlers';
import type { PushSender } from '../../src/services/pushSender';
import type { RedisStreamConsumerClient, RedisStreamConsumerOptions } from '@specify-poker/shared/redis';

describe('EventConsumer', () => {
  type RunConsumer = (signal: AbortSignal, options: RedisStreamConsumerOptions) => Promise<void>;

  let consumer: EventConsumer;
  let pushSenderMock: PushSender;
  let runConsumer: RunConsumer;

  beforeEach(() => {
    const sendToUser = vi
      .fn<PushSender['sendToUser']>()
      .mockResolvedValue({ success: 0, failure: 0 });
    pushSenderMock = { sendToUser };

    runConsumer = vi.fn<RunConsumer>(async (signal, _options) => {
      if (signal.aborted) {
        return;
      }
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    consumer = new EventConsumer(createGameEventHandlers(pushSenderMock), {
      streamKey: 'events:game',
      getRedisClient: async () => ({} as RedisStreamConsumerClient),
      runConsumer,
    });
  });

  it('should handle TURN_STARTED event', async () => {
    const message = {
      type: 'TURN_STARTED',
      userId: 'u1',
      tableId: 't1',
    };

    await consumer.handleMessage(message);

    expect(pushSenderMock.sendToUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        title: "It's your turn!",
        data: expect.objectContaining({ tableId: 't1' }),
      }),
    );
  });

  it('should ignore other event types', async () => {
    const message = {
      type: 'HAND_STARTED',
      userId: 'u1',
    };

    await consumer.handleMessage(message);

    expect(pushSenderMock.sendToUser).not.toHaveBeenCalled();
  });

  it('should handle missing userId in event', async () => {
    const message = {
      type: 'TURN_STARTED',
      tableId: 't1',
    };

    await consumer.handleMessage(message);

    expect(pushSenderMock.sendToUser).not.toHaveBeenCalled();
  });

  it('should handle errors in handleEvent gracefully', async () => {
    const message = {
      type: 'TURN_STARTED',
      userId: 'u1',
    };
    pushSenderMock.sendToUser.mockRejectedValue(new Error('Push error'));

    // Should not throw
    await expect(consumer.handleMessage(message)).resolves.not.toThrow();
  });

  it('should start and stop', async () => {
    // We can't easily test the full poll loop because it blocks,
    // but we can test that it initializes correctly and sets isRunning.
    await consumer.start();

    expect(consumer.isRunning()).toBe(true);

    await consumer.stop();
    expect(consumer.isRunning()).toBe(false);
  });

  it('should restart the poll loop after a crash', async () => {
    const sleep = vi.fn(async () => {});
    let runs = 0;

    const crashingRunConsumer = vi.fn<RunConsumer>(async (signal, _options) => {
      runs += 1;

      if (runs === 1) {
        throw new Error('boom');
      }

      if (signal.aborted) {
        return;
      }

      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    const restartable = new EventConsumer(createGameEventHandlers(pushSenderMock), {
      streamKey: 'events:game',
      getRedisClient: async () => ({} as RedisStreamConsumerClient),
      runConsumer: crashingRunConsumer,
      sleep,
    });

    await restartable.start();

    for (let i = 0; i < 10; i += 1) {
      if (crashingRunConsumer.mock.calls.length >= 2) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(crashingRunConsumer).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);

    await restartable.stop();
  });
});
