import type { EventIngestionService } from './eventIngestionService';
import type { EventQueryService } from './eventQueryService';
import type { HandRecordService } from './handRecordService';
import type { ReplayService } from './replayService';
import type { StreamService } from './streamService';
import { createAsyncMethodProxy, createLazyValue } from '@specify-poker/shared';

export type EventServiceFacade = {
  eventIngestion: Pick<EventIngestionService, 'ingestEvent' | 'ingestEvents'>;
  eventQuery: Pick<EventQueryService, 'queryEvents' | 'getEvent'>;
  handRecords: Pick<HandRecordService, 'getHandRecord' | 'getHandHistory' | 'getHandsForUser'>;
  replay: Pick<ReplayService, 'getHandEvents'>;
  stream: Pick<StreamService, 'getCursor' | 'updateCursor' | 'readStream'>;
};

export type CreateEventServiceFacadeOptions = Partial<EventServiceFacade>;

function createLazyServiceProxy<TService extends object>(load: () => Promise<TService>): TService {
  const lazy = createLazyValue(load);
  return createAsyncMethodProxy(() => lazy.get());
}

function loadDefaultEventServiceFacade(): EventServiceFacade {
  // Keep singleton imports lazy so tests can inject services without booting storage clients.
  const eventIngestion: EventServiceFacade['eventIngestion'] = createLazyServiceProxy(async () => {
    const module = await import('./eventIngestionService');
    return module.eventIngestionService;
  });
  const eventQuery: EventServiceFacade['eventQuery'] = createLazyServiceProxy(async () => {
    const module = await import('./eventQueryService');
    return module.eventQueryService;
  });
  const handRecords: EventServiceFacade['handRecords'] = createLazyServiceProxy(async () => {
    const module = await import('./handRecordService');
    return module.handRecordService;
  });
  const replay: EventServiceFacade['replay'] = createLazyServiceProxy(async () => {
    const module = await import('./replayService');
    return module.replayService;
  });
  const stream: EventServiceFacade['stream'] = createLazyServiceProxy(async () => {
    const module = await import('./streamService');
    return module.streamService;
  });

  return { eventIngestion, eventQuery, handRecords, replay, stream };
}

export function createEventServiceFacade(
  overrides: CreateEventServiceFacadeOptions = {},
): EventServiceFacade {
  const defaults = loadDefaultEventServiceFacade();
  return {
    eventIngestion: overrides.eventIngestion ?? defaults.eventIngestion,
    eventQuery: overrides.eventQuery ?? defaults.eventQuery,
    handRecords: overrides.handRecords ?? defaults.handRecords,
    replay: overrides.replay ?? defaults.replay,
    stream: overrides.stream ?? defaults.stream,
  };
}
