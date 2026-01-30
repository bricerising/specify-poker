import type { EventIngestionService } from './eventIngestionService';
import type { EventQueryService } from './eventQueryService';
import type { HandRecordService } from './handRecordService';
import type { ReplayService } from './replayService';
import type { StreamService } from './streamService';

export type EventServiceFacade = {
  eventIngestion: Pick<EventIngestionService, 'ingestEvent' | 'ingestEvents'>;
  eventQuery: Pick<EventQueryService, 'queryEvents' | 'getEvent'>;
  handRecords: Pick<HandRecordService, 'getHandRecord' | 'getHandHistory' | 'getHandsForUser'>;
  replay: Pick<ReplayService, 'getHandEvents'>;
  stream: Pick<StreamService, 'getCursor' | 'updateCursor' | 'readStream'>;
};

export type CreateEventServiceFacadeOptions = Partial<EventServiceFacade>;

function onceAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    if (!promise) {
      promise = factory();
    }
    return promise;
  };
}

function loadDefaultEventServiceFacade(): EventServiceFacade {
  // Keep singleton imports lazy so tests can inject services without booting storage clients.
  const loadEventIngestionService = onceAsync(
    async () => (await import('./eventIngestionService')).eventIngestionService,
  );
  const loadEventQueryService = onceAsync(
    async () => (await import('./eventQueryService')).eventQueryService,
  );
  const loadHandRecordService = onceAsync(
    async () => (await import('./handRecordService')).handRecordService,
  );
  const loadReplayService = onceAsync(async () => (await import('./replayService')).replayService);
  const loadStreamService = onceAsync(async () => (await import('./streamService')).streamService);

  return {
    eventIngestion: {
      ingestEvent: async (event) => (await loadEventIngestionService()).ingestEvent(event),
      ingestEvents: async (events) => (await loadEventIngestionService()).ingestEvents(events),
    },
    eventQuery: {
      queryEvents: async (query) => (await loadEventQueryService()).queryEvents(query),
      getEvent: async (eventId) => (await loadEventQueryService()).getEvent(eventId),
    },
    handRecords: {
      getHandRecord: async (handId, requesterUserId, isOperator) =>
        (await loadHandRecordService()).getHandRecord(handId, requesterUserId, isOperator),
      getHandHistory: async (tableId, limit, offset, requesterUserId, isOperator) =>
        (await loadHandRecordService()).getHandHistory(
          tableId,
          limit,
          offset,
          requesterUserId,
          isOperator,
        ),
      getHandsForUser: async (userId, limit, offset, requesterUserId, isOperator) =>
        (await loadHandRecordService()).getHandsForUser(
          userId,
          limit,
          offset,
          requesterUserId,
          isOperator,
        ),
    },
    replay: {
      getHandEvents: async (handId, requesterUserId, isOperator) =>
        (await loadReplayService()).getHandEvents(handId, requesterUserId, isOperator),
    },
    stream: {
      getCursor: async (streamId, subscriberId) =>
        (await loadStreamService()).getCursor(streamId, subscriberId),
      updateCursor: async (streamId, subscriberId, position) =>
        (await loadStreamService()).updateCursor(streamId, subscriberId, position),
      readStream: async (streamId, lastId) => (await loadStreamService()).readStream(streamId, lastId),
    },
  };
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
