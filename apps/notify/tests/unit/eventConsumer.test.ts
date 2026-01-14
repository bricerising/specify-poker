import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventConsumer } from "../../src/services/eventConsumer";
import { PushSenderService } from "../../src/services/pushSenderService";

// Mock redis
vi.mock('../../src/storage/redisClient', () => {
  const xReadGroup = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(null), 100)));
  return {
    getRedisClient: () => Promise.resolve({
      xGroupCreate: vi.fn(),
      xReadGroup,
      xAck: vi.fn(),
    }),
  };
});

describe('EventConsumer', () => {
  let consumer: EventConsumer;
  let pushServiceMock: unknown;

  beforeEach(() => {
    pushServiceMock = {
      sendToUser: vi.fn(),
    };
    consumer = new EventConsumer(pushServiceMock as unknown as PushSenderService);
  });

  it('should handle TURN_STARTED event', async () => {
    const message = {
      type: 'TURN_STARTED',
      userId: 'u1',
      tableId: 't1',
    };

    // Access private method for testing
    await (consumer as unknown).handleEvent(message);

    expect(pushServiceMock.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({
      title: "It's your turn!",
      data: expect.objectContaining({ tableId: 't1' }),
    }));
  });

  it('should ignore other event types', async () => {
    const message = {
      type: 'HAND_STARTED',
      userId: 'u1',
    };

    await (consumer as unknown).handleEvent(message);

    expect(pushServiceMock.sendToUser).not.toHaveBeenCalled();
  });

  it('should handle missing userId in event', async () => {
    const message = {
      type: 'TURN_STARTED',
      tableId: 't1',
    };

    await (consumer as unknown).handleEvent(message);

    expect(pushServiceMock.sendToUser).not.toHaveBeenCalled();
  });

  it('should handle errors in handleEvent gracefully', async () => {
    const message = {
      type: 'TURN_STARTED',
      userId: 'u1',
    };
    pushServiceMock.sendToUser.mockRejectedValue(new Error('Push error'));

    // Should not throw
    await expect((consumer as unknown).handleEvent(message)).resolves.not.toThrow();
  });

  it('should start and stop', async () => {
    // We can't easily test the full poll loop because it blocks,
    // but we can test that it initializes correctly and sets isRunning.
    await consumer.start();

    expect((consumer as unknown).isRunning).toBe(true);

    consumer.stop();
    expect((consumer as unknown).isRunning).toBe(false);
  });
});
