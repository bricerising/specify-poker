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

    expect(result).toEqual({ eventId: 'e1' });
    expect(eventStore.publishEvent).toHaveBeenCalledWith({
      type: 'PLAYER_JOINED',
      tableId: 'table-1',
      payload: { userId: 'user-1' },
    });
    expect(recordIngestion).toHaveBeenCalledWith('PLAYER_JOINED');
  });

  it('rejects events missing required fields', async () => {
    await expect(
      service.ingestEvent({
        type: 'HAND_STARTED',
        tableId: 'table-1',
        payload: { foo: 'bar' },
      }),
    ).rejects.toThrow('handId is required for event type HAND_STARTED');

    await expect(
      service.ingestEvent({
        type: 'PLAYER_JOINED',
        tableId: '',
        payload: { foo: 'bar' },
      }),
    ).rejects.toThrow('Table ID is required');

    await expect(
      service.ingestEvent({
        type: 'PLAYER_JOINED',
        tableId: 'table-1',
        payload: null as unknown as Record<string, unknown>,
      }),
    ).rejects.toThrow('Payload must be an object');
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

    expect(result).toEqual([{ eventId: 'e1' }, { eventId: 'e2' }]);
    expect(eventStore.publishEvents).toHaveBeenCalledTimes(1);
    expect(recordIngestion).toHaveBeenCalledWith('PLAYER_JOINED');
    expect(recordIngestion).toHaveBeenCalledWith('PLAYER_LEFT');
  });

  it('rejects invalid events before publishing a batch', async () => {
    await expect(
      service.ingestEvents([
        { type: 'HAND_STARTED', tableId: 'table-1', payload: {} },
        { type: 'PLAYER_JOINED', tableId: 'table-1', payload: {} },
      ]),
    ).rejects.toThrow('handId is required for event type HAND_STARTED');

    expect(eventStore.publishEvents).not.toHaveBeenCalled();
  });
});
