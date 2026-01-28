import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handMaterializer } from '../handMaterializer';
import { eventStore } from '../../storage/eventStore';
import { handStore } from '../../storage/handStore';

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

    const mockEvents = [
      {
        type: 'HAND_STARTED',
        handId,
        tableId,
        payload: {
          tableName: 'Test Table',
          smallBlind: 10,
          bigBlind: 20,
          seats: [{ userId: 'user-1', nickname: 'Alice', seatId: 1, stack: 1000 }],
        },
        timestamp,
      },
      {
        type: 'CARDS_DEALT',
        handId,
        userId: 'user-1',
        payload: {
          cards: [
            { rank: 'A', suit: 's' },
            { rank: 'A', suit: 'd' },
          ],
        },
        timestamp,
      },
      {
        type: 'ACTION_TAKEN',
        handId,
        userId: 'user-1',
        payload: { street: 'PREFLOP', action: 'RAISE', amount: 50, isAllIn: false },
        timestamp,
      },
      {
        type: 'STREET_ADVANCED',
        handId,
        payload: {
          communityCards: [
            { rank: 'K', suit: 's' },
            { rank: 'Q', suit: 's' },
            { rank: 'J', suit: 's' },
          ],
        },
        timestamp,
      },
      {
        type: 'POT_AWARDED',
        handId,
        payload: { amount: 100, winners: [{ userId: 'user-1', share: 100, seatId: 1 }] },
        timestamp,
      },
      {
        type: 'HAND_COMPLETED',
        handId,
        tableId,
        payload: { playerEndStacks: { 'user-1': 1050 } },
        timestamp,
      },
    ];

    vi.mocked(eventStore.queryEvents).mockResolvedValue({
      events: mockEvents as unknown as Record<string, unknown>[],
      total: 6,
    } as unknown as { events: unknown[]; total: number });

    // Directly call the private method for testing or trigger it via handleEvent
    await (
      handMaterializer as unknown as { handleEvent: (e: Record<string, unknown>) => Promise<void> }
    ).handleEvent({
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
