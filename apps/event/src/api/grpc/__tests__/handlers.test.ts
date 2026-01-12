import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHandlers } from '../handlers';
import { eventStore } from '../../../storage/eventStore';
import { handStore } from '../../../storage/handStore';

vi.mock('../../../storage/eventStore', () => ({
  eventStore: {
    publishEvent: vi.fn(),
    queryEvents: vi.fn(),
    getEventById: vi.fn(),
  },
}));

vi.mock('../../../storage/handStore', () => ({
  handStore: {
    getHandRecord: vi.fn(),
    getHandHistory: vi.fn(),
    getHandsForUser: vi.fn(),
  },
}));

vi.mock('../../../storage/redisClient', () => ({
  default: {
    xRead: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('gRPC Handlers', () => {
  let handlers: any;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = createHandlers();
  });

  it('should handle publishEvent', async () => {
    const call = {
      request: {
        type: 'TEST',
        tableId: 't1',
        payload: { foo: 'bar' }
      }
    };
    const callback = vi.fn();
    (eventStore.publishEvent as any).mockResolvedValue({ event_id: 'e1' });

    await handlers.publishEvent(call, callback);

    expect(eventStore.publishEvent).toHaveBeenCalledWith({
      type: 'TEST',
      table_id: 't1',
      payload: { foo: 'bar' },
      hand_id: undefined,
      user_id: undefined,
      seat_id: undefined
    });
    expect(callback).toHaveBeenCalledWith(null, { success: true, eventId: 'e1' });
  });

  it('should handle getEvent', async () => {
    const call = { request: { eventId: 'e1' } };
    const callback = vi.fn();
    const mockEvent = {
      event_id: 'e1',
      type: 'TEST',
      table_id: 't1',
      payload: {},
      timestamp: new Date(),
      sequence: 1
    };
    (eventStore.getEventById as any).mockResolvedValue(mockEvent);

    await handlers.getEvent(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      eventId: 'e1',
      type: 'TEST'
    }));
  });

  it('should return NOT_FOUND if event does not exist', async () => {
    const call = { request: { eventId: 'nonexistent' } };
    const callback = vi.fn();
    (eventStore.getEventById as any).mockResolvedValue(null);

    await handlers.getEvent(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      code: 5 // NOT_FOUND
    }));
  });

  it('should handle publishEvents (plural)', async () => {
    const call = {
      request: {
        events: [
          { type: 'T1', tableId: 't1', payload: {} },
          { type: 'T2', tableId: 't1', payload: {} }
        ]
      }
    };
    const callback = vi.fn();
    (eventStore.publishEvent as any).mockResolvedValueOnce({ event_id: 'e1' });
    (eventStore.publishEvent as any).mockResolvedValueOnce({ event_id: 'e2' });

    await handlers.publishEvents(call, callback);

    expect(eventStore.publishEvent).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(null, { success: true, eventIds: ['e1', 'e2'] });
  });

  it('should handle queryEvents', async () => {
    const call = {
      request: {
        tableId: 't1',
        limit: 10,
        offset: 0
      }
    };
    const callback = vi.fn();
    (eventStore.queryEvents as any).mockResolvedValue({
      events: [{ event_id: 'e1', type: 'T1', table_id: 't1', payload: {}, timestamp: new Date(), sequence: 1 }],
      total: 1
    });

    await handlers.queryEvents(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      total: 1,
      hasMore: false
    }));
  });

  it('should handle getHandRecord', async () => {
    const call = { request: { handId: 'h1' } };
    const callback = vi.fn();
    const mockRecord = {
      hand_id: 'h1',
      table_id: 't1',
      config: {},
      participants: [],
      community_cards: [],
      pots: [],
      winners: [],
      started_at: new Date(),
      completed_at: new Date()
    };
    (handStore.getHandRecord as any).mockResolvedValue(mockRecord);

    await handlers.getHandRecord(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      handId: 'h1'
    }));
  });

  it('should handle getHandHistory', async () => {
    const call = { request: { tableId: 't1', limit: 10, offset: 0 } };
    const callback = vi.fn();
    (handStore.getHandHistory as any).mockResolvedValue({
      hands: [{ hand_id: 'h1', table_id: 't1', config: {}, participants: [], community_cards: [], pots: [], winners: [], started_at: new Date(), completed_at: new Date() }],
      total: 1
    });

    await handlers.getHandHistory(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      total: 1
    }));
  });

  it('should handle getHandsForUser', async () => {
    const call = { request: { userId: 'u1', limit: 10, offset: 0 } };
    const callback = vi.fn();
    (handStore.getHandsForUser as any).mockResolvedValue({
      hands: [{ hand_id: 'h1', table_id: 't1', config: {}, participants: [], community_cards: [], pots: [], winners: [], started_at: new Date(), completed_at: new Date() }],
      total: 1
    });

    await handlers.getHandsForUser(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      total: 1
    }));
  });

  it('should handle getHandReplay', async () => {
    const call = { request: { handId: 'h1' } };
    const callback = vi.fn();
    (eventStore.queryEvents as any).mockResolvedValue({
      events: [{ event_id: 'e1', type: 'T1', table_id: 't1', payload: {}, timestamp: new Date(), sequence: 1 }],
      total: 1
    });

    await handlers.getHandReplay(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      handId: 'h1',
      events: expect.any(Array)
    }));
  });

  it('should handle updateCursor', async () => {
    const call = { request: { streamId: 's1', subscriberId: 'sub1', position: 123 } };
    const callback = vi.fn();

    await handlers.updateCursor(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      position: 123
    }));
  });

  it('should handle getCursor', async () => {
    const call = { request: { streamId: 's1', subscriberId: 'sub1' } };
    const callback = vi.fn();
    const redisClient = (await import('../../../storage/redisClient')).default;
    (redisClient.get as any).mockResolvedValue('123');

    await handlers.getCursor(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      position: 123
    }));
  });

  it('should handle publishEvent error', async () => {
    const call = { request: { type: 'TEST', tableId: 't1' } };
    const callback = vi.fn();
    (eventStore.publishEvent as any).mockRejectedValue(new Error('Test Error'));

    await handlers.publishEvent(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      code: 13, // INTERNAL
      message: 'Test Error'
    }));
  });

  it('should handle getHandRecord NOT_FOUND', async () => {
    const call = { request: { handId: 'nonexistent' } };
    const callback = vi.fn();
    (handStore.getHandRecord as any).mockResolvedValue(null);

    await handlers.getHandRecord(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      code: 5 // NOT_FOUND
    }));
  });
});
