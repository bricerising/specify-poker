import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventIngestionService } from '../eventIngestionService';
import { eventStore } from '../../storage/eventStore';
import { recordIngestion } from '../../observability/metrics';

vi.mock('../../storage/eventStore', () => ({
  eventStore: {
    publishEvent: vi.fn(),
    publishEvents: vi.fn(),
  },
}));

vi.mock('../../observability/metrics', () => ({
  recordIngestion: vi.fn(),
}));

describe('EventIngestionService', () => {
  const service = new EventIngestionService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ingests a single event and records metrics', async () => {
    vi.mocked(eventStore.publishEvent).mockResolvedValue({ eventId: 'e1' } as never);

    const result = await service.ingestEvent({
      type: 'PLAYER_JOINED',
      tableId: 'table-1',
      payload: { userId: 'user-1' },
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ eventId: 'e1' });
    expect(eventStore.publishEvent).toHaveBeenCalledWith({
      type: 'PLAYER_JOINED',
      tableId: 'table-1',
      payload: { userId: 'user-1' },
    });
    expect(recordIngestion).toHaveBeenCalledWith('PLAYER_JOINED');
  });

  it('returns error for events missing required fields', async () => {
    const missingHandId = await service.ingestEvent({
      type: 'HAND_STARTED',
      tableId: 'table-1',
      payload: { foo: 'bar' },
    });
    expect(missingHandId.ok).toBe(false);
    expect(!missingHandId.ok && missingHandId.error).toEqual({
      type: 'MissingHandId',
      eventType: 'HAND_STARTED',
    });

    const missingTableId = await service.ingestEvent({
      type: 'PLAYER_JOINED',
      tableId: '',
      payload: { foo: 'bar' },
    });
    expect(missingTableId.ok).toBe(false);
    expect(!missingTableId.ok && missingTableId.error.type).toBe('MissingTableId');

    const invalidPayload = await service.ingestEvent({
      type: 'PLAYER_JOINED',
      tableId: 'table-1',
      payload: null as unknown as Record<string, unknown>,
    });
    expect(invalidPayload.ok).toBe(false);
    expect(!invalidPayload.ok && invalidPayload.error.type).toBe('InvalidPayload');
  });

  it('ingests a batch of events and records metrics per event', async () => {
    vi.mocked(eventStore.publishEvents).mockResolvedValue([
      { eventId: 'e1' },
      { eventId: 'e2' },
    ] as never);

    const result = await service.ingestEvents([
      { type: 'PLAYER_JOINED', tableId: 'table-1', payload: {} },
      { type: 'PLAYER_LEFT', tableId: 'table-1', payload: {} },
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([{ eventId: 'e1' }, { eventId: 'e2' }]);
    expect(eventStore.publishEvents).toHaveBeenCalledTimes(1);
    expect(recordIngestion).toHaveBeenCalledWith('PLAYER_JOINED');
    expect(recordIngestion).toHaveBeenCalledWith('PLAYER_LEFT');
  });

  it('returns error for invalid events before publishing a batch', async () => {
    const result = await service.ingestEvents([
      { type: 'HAND_STARTED', tableId: 'table-1', payload: {} },
      { type: 'PLAYER_JOINED', tableId: 'table-1', payload: {} },
    ]);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      type: 'MissingHandId',
      eventType: 'HAND_STARTED',
    });
    expect(eventStore.publishEvents).not.toHaveBeenCalled();
  });
});
