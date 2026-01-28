import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventConsumer } from '../../src/services/eventConsumer';
import * as statisticsService from '../../src/services/statisticsService';

vi.mock('../../src/services/statisticsService', () => ({
  incrementHandsPlayed: vi.fn(),
  incrementWins: vi.fn(),
}));

vi.mock('../../src/storage/redisClient', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('../../src/observability/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('EventConsumer', () => {
  let consumer: EventConsumer;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new EventConsumer();
  });

  describe('handleEvent', () => {
    it('should record hands played on HAND_STARTED', async () => {
      const event = {
        type: 'HAND_STARTED',
        payload: {
          fields: {
            participants: {
              listValue: {
                values: [{ stringValue: 'user1' }, { stringValue: 'user2' }],
              },
            },
          },
        },
      };

      await consumer.handleEvent(event);

      expect(statisticsService.incrementHandsPlayed).toHaveBeenCalledWith('user1');
      expect(statisticsService.incrementHandsPlayed).toHaveBeenCalledWith('user2');
    });

    it('should record wins on HAND_ENDED', async () => {
      const event = {
        type: 'HAND_ENDED',
        payload: {
          fields: {
            winnerUserIds: {
              listValue: {
                values: [{ stringValue: 'user1' }],
              },
            },
          },
        },
      };

      await consumer.handleEvent(event);

      expect(statisticsService.incrementWins).toHaveBeenCalledWith('user1');
    });

    it('ignores events without a type', async () => {
      const event = { payload: {} };

      await consumer.handleEvent(event);

      expect(statisticsService.incrementHandsPlayed).not.toHaveBeenCalled();
      expect(statisticsService.incrementWins).not.toHaveBeenCalled();
    });

    it('handles plain payload objects for HAND_ENDED', async () => {
      const event = {
        type: 'HAND_ENDED',
        payload: { winnerUserIds: ['user3'] },
      };

      await consumer.handleEvent(event);

      expect(statisticsService.incrementWins).toHaveBeenCalledWith('user3');
    });

    it('logs errors when event handling fails', async () => {
      const logger = await import('../../src/observability/logger');
      vi.mocked(statisticsService.incrementHandsPlayed).mockRejectedValue(new Error('boom'));

      const event = {
        type: 'HAND_STARTED',
        payload: { participants: ['user4'] },
      };

      await consumer.handleEvent(event);

      expect(logger.default.error).toHaveBeenCalled();
    });

    it('handles list payloads with mixed values', async () => {
      const event = {
        type: 'HAND_STARTED',
        payload: {
          fields: {
            participants: {
              listValue: {
                values: [
                  { stringValue: 'user-a' },
                  { numberValue: 123 },
                  { nullValue: 'NULL_VALUE' },
                  { structValue: { fields: { nested: { stringValue: 'user-b' } } } },
                ],
              },
            },
          },
        },
      };

      await consumer.handleEvent(event);

      expect(statisticsService.incrementHandsPlayed).toHaveBeenCalledWith('user-a');
      expect(statisticsService.incrementHandsPlayed).not.toHaveBeenCalledWith('user-b');
    });

    it('handles nested structs and bool values without crashing', async () => {
      const event = {
        type: 'HAND_ENDED',
        payload: {
          fields: {
            winnerUserIds: {
              listValue: {
                values: [{ stringValue: 'user-x' }, { boolValue: true }],
              },
            },
          },
        },
      };

      await consumer.handleEvent(event);

      expect(statisticsService.incrementWins).toHaveBeenCalledWith('user-x');
    });
  });
});
