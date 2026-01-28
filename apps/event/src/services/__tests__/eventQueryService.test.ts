import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventQueryService } from '../eventQueryService';
import { eventStore } from '../../storage/eventStore';
import { recordQueryDuration } from '../../observability/metrics';

vi.mock('../../storage/eventStore', () => ({
  eventStore: {
    queryEvents: vi.fn(),
    getEventById: vi.fn(),
  },
}));

vi.mock('../../observability/metrics', () => ({
  recordQueryDuration: vi.fn(),
}));

describe('EventQueryService', () => {
  const service = new EventQueryService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated results with a next cursor', async () => {
    vi.mocked(eventStore.queryEvents).mockResolvedValue({
      events: [
        {
          eventId: 'e2',
          type: 'ACTION_TAKEN',
          tableId: 'table-1',
          handId: 'hand-1',
          userId: 'user-1',
          seatId: 1,
          payload: {},
          timestamp: new Date(),
          sequence: 2,
        },
      ],
      total: 4,
    } as never);

    const cursor = Buffer.from('2', 'utf8').toString('base64');
    const result = await service.queryEvents({
      tableId: 'table-1',
      limit: 1,
      cursor,
    });

    expect(eventStore.queryEvents).toHaveBeenCalledWith({
      tableId: 'table-1',
      handId: undefined,
      userId: undefined,
      types: undefined,
      startTime: undefined,
      endTime: undefined,
      limit: 1,
      offset: 2,
    });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(Buffer.from('3', 'utf8').toString('base64'));
    expect(recordQueryDuration).toHaveBeenCalledWith('ok', expect.any(Number));
  });

  it('records query duration on error', async () => {
    vi.mocked(eventStore.queryEvents).mockRejectedValue(new Error('boom'));

    await expect(service.queryEvents({ limit: 10 })).rejects.toThrow('boom');

    expect(recordQueryDuration).toHaveBeenCalledWith('error', expect.any(Number));
  });
});
