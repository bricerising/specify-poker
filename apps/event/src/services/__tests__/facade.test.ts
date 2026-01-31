import { beforeEach, describe, expect, it, vi } from 'vitest';

const ingestEvent = vi.fn(async () => ({ ok: true }));
const ingestEvents = vi.fn(async () => ({ ok: true }));
const ingestionModuleFactory = vi.fn(() => ({
  eventIngestionService: { ingestEvent, ingestEvents },
}));

vi.mock('../eventIngestionService', () => ingestionModuleFactory());

describe('Event service facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('lazily imports default services on first call', async () => {
    const { createEventServiceFacade } = await import('../facade');
    const facade = createEventServiceFacade();

    expect(ingestionModuleFactory).toHaveBeenCalledTimes(0);

    const event = {
      type: 'PLAYER_JOINED',
      tableId: 't1',
      payload: {},
    } as unknown as Parameters<typeof facade.eventIngestion.ingestEvent>[0];

    await facade.eventIngestion.ingestEvent(event);
    await facade.eventIngestion.ingestEvent(event);

    expect(ingestionModuleFactory).toHaveBeenCalledTimes(1);
    expect(ingestEvent).toHaveBeenCalledTimes(2);
  });
});

