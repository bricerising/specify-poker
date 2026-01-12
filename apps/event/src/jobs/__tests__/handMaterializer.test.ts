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
        hand_id: handId,
        table_id: tableId,
        payload: { table_name: 'Test Table', config: { sb: 10, bb: 20 }, seats: [{ userId: 'user-1', nickname: 'Alice', seatId: 1, stack: 1000 }] },
        timestamp
      },
      {
        type: 'CARDS_DEALT',
        hand_id: handId,
        user_id: 'user-1',
        payload: { cards: ['As', 'Ad'] },
        timestamp
      },
      {
        type: 'ACTION_TAKEN',
        hand_id: handId,
        user_id: 'user-1',
        payload: { street: 'PREFLOP', action: 'RAISE', amount: 50 },
        timestamp
      },
      {
        type: 'STREET_ADVANCED',
        hand_id: handId,
        payload: { communityCards: ['Ks', 'Qs', 'Js'] },
        timestamp
      },
      {
        type: 'POT_AWARDED',
        hand_id: handId,
        payload: { amount: 100, winners: [{ userId: 'user-1', amount: 100 }] },
        timestamp
      },
      {
        type: 'HAND_COMPLETED',
        hand_id: handId,
        table_id: tableId,
        payload: { player_end_stacks: { 'user-1': 1050 } },
        timestamp
      }
    ];

    vi.mocked(eventStore.queryEvents).mockResolvedValue({ events: mockEvents as any, total: 6 });

    // Directly call the private method for testing or trigger it via handleEvent
    await (handMaterializer as any).handleEvent({ type: 'HAND_COMPLETED', hand_id: handId, table_id: tableId });

    expect(eventStore.queryEvents).toHaveBeenCalledWith({ hand_id: handId, limit: 1000 });
    expect(handStore.saveHandRecord).toHaveBeenCalled();

    const savedRecord = vi.mocked(handStore.saveHandRecord).mock.calls[0][0];
    expect(savedRecord.hand_id).toBe(handId);
    expect(savedRecord.participants).toHaveLength(1);
    expect(savedRecord.participants[0].user_id).toBe('user-1');
    expect(savedRecord.participants[0].hole_cards).toEqual(['As', 'Ad']);
    expect(savedRecord.participants[0].actions).toHaveLength(1);
    expect(savedRecord.community_cards).toEqual(['Ks', 'Qs', 'Js']);
    expect(savedRecord.winners).toEqual([{ user_id: 'user-1', amount: 100 }]);
    expect(savedRecord.participants[0].ending_stack).toBe(1050);
  });
});
