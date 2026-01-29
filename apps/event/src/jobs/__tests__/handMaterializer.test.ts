import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handMaterializer } from '../handMaterializer';
import { eventStore } from '../../storage/eventStore';
import { handStore } from '../../storage/handStore';
import type { GameEvent } from '../../domain/types';

vi.mock('../../storage/eventStore');
vi.mock('../../storage/handStore');
vi.mock('../../storage/redisClient');

describe('HandMaterializer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should materialize a hand correctly from events', async () => {
    const handId = 'hand-123';
    const tableId = 'table-456';
    const timestamp = new Date();

    const mockEvents: GameEvent[] = [
      {
        eventId: 'event-1',
        type: 'HAND_STARTED',
        tableId,
        handId,
        userId: null,
        seatId: null,
        payload: {
          tableName: 'Test Table',
          smallBlind: 10,
          bigBlind: 20,
          seats: [{ userId: 'user-1', nickname: 'Alice', seatId: 1, stack: 1000 }],
        },
        sequence: 1,
        timestamp,
      },
      {
        eventId: 'event-2',
        type: 'CARDS_DEALT',
        tableId,
        handId,
        userId: 'user-1',
        seatId: 1,
        payload: {
          cards: [
            { rank: 'A', suit: 's' },
            { rank: 'A', suit: 'd' },
          ],
        },
        sequence: 2,
        timestamp,
      },
      {
        eventId: 'event-3',
        type: 'ACTION_TAKEN',
        tableId,
        handId,
        userId: 'user-1',
        seatId: 1,
        payload: { street: 'PREFLOP', action: 'RAISE', amount: 50, isAllIn: false },
        sequence: 3,
        timestamp,
      },
      {
        eventId: 'event-4',
        type: 'STREET_ADVANCED',
        tableId,
        handId,
        userId: null,
        seatId: null,
        payload: {
          communityCards: [
            { rank: 'K', suit: 's' },
            { rank: 'Q', suit: 's' },
            { rank: 'J', suit: 's' },
          ],
        },
        sequence: 4,
        timestamp,
      },
      {
        eventId: 'event-5',
        type: 'POT_AWARDED',
        tableId,
        handId,
        userId: null,
        seatId: null,
        payload: { amount: 100, winners: [{ userId: 'user-1', share: 100, seatId: 1 }] },
        sequence: 5,
        timestamp,
      },
      {
        eventId: 'event-6',
        type: 'HAND_COMPLETED',
        tableId,
        handId,
        userId: null,
        seatId: null,
        payload: { playerEndStacks: { 'user-1': 1050 } },
        sequence: 6,
        timestamp,
      },
    ];

    vi.mocked(eventStore.queryEvents).mockResolvedValue({
      events: mockEvents,
      total: mockEvents.length,
    });

    await handMaterializer.handleEvent({
      type: 'HAND_COMPLETED',
      handId,
      tableId,
    });

    expect(eventStore.queryEvents).toHaveBeenCalledWith({ handId, limit: 1000 });
    expect(handStore.saveHandRecord).toHaveBeenCalled();

    const savedRecord = vi.mocked(handStore.saveHandRecord).mock.calls[0][0];
    expect(savedRecord.handId).toBe(handId);
    expect(savedRecord.participants).toHaveLength(1);
    expect(savedRecord.participants[0].userId).toBe('user-1');
    expect(savedRecord.participants[0].holeCards).toHaveLength(2);
    expect(savedRecord.participants[0].actions).toHaveLength(1);
    expect(savedRecord.communityCards).toHaveLength(3);
    expect(savedRecord.winners).toEqual([{ userId: 'user-1', amount: 100 }]);
    expect(savedRecord.participants[0].endingStack).toBe(1050);
  });
});
