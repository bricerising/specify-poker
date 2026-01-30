import { err, ok, type Result } from '@specify-poker/shared';
import { eventStore } from '../storage/eventStore';
import type { EventType, NewGameEvent } from '../domain/types';
import { isEventType } from '../domain/types';
import { recordIngestion } from '../observability/metrics';
import { isRecord, type EventValidationError } from '../errors';

const HAND_EVENT_TYPES = new Set<EventType>([
  'HAND_STARTED',
  'CARDS_DEALT',
  'BLIND_POSTED',
  'ACTION_TAKEN',
  'STREET_ADVANCED',
  'CARDS_REVEALED',
  'SHOWDOWN',
  'POT_AWARDED',
  'HAND_COMPLETED',
  'TURN_STARTED',
  'RAKE_DEDUCTED',
]);

type EventValidator = (event: NewGameEvent) => EventValidationError | null;

function validateTypeIsPresent(event: NewGameEvent): EventValidationError | null {
  if (!event.type) {
    return { type: 'MissingType' };
  }
  return null;
}

function validateTypeIsKnown(event: NewGameEvent): EventValidationError | null {
  if (!isEventType(event.type)) {
    return { type: 'UnknownType', eventType: String(event.type) };
  }
  return null;
}

function validateTableId(event: NewGameEvent): EventValidationError | null {
  if (typeof event.tableId !== 'string' || event.tableId.trim().length === 0) {
    return { type: 'MissingTableId' };
  }
  return null;
}

function validatePayloadIsObject(event: NewGameEvent): EventValidationError | null {
  if (!isRecord(event.payload)) {
    return { type: 'InvalidPayload' };
  }
  return null;
}

function validateHandIdIfRequired(event: NewGameEvent): EventValidationError | null {
  const requiresHandId = HAND_EVENT_TYPES.has(event.type);
  if (!requiresHandId) {
    return null;
  }
  if (typeof event.handId !== 'string' || event.handId.trim().length === 0) {
    return { type: 'MissingHandId', eventType: event.type };
  }
  return null;
}

function validateOptionalUserId(event: NewGameEvent): EventValidationError | null {
  if (event.userId === undefined || event.userId === null) {
    return null;
  }
  if (typeof event.userId !== 'string' || event.userId.trim().length === 0) {
    return { type: 'InvalidUserId' };
  }
  return null;
}

function validateOptionalSeatId(event: NewGameEvent): EventValidationError | null {
  if (event.seatId === undefined || event.seatId === null) {
    return null;
  }
  if (typeof event.seatId !== 'number' || !Number.isFinite(event.seatId)) {
    return { type: 'InvalidSeatId' };
  }
  return null;
}

function validateOptionalIdempotencyKey(event: NewGameEvent): EventValidationError | null {
  if (event.idempotencyKey === undefined || event.idempotencyKey === null) {
    return null;
  }
  if (typeof event.idempotencyKey !== 'string' || event.idempotencyKey.trim().length === 0) {
    return { type: 'InvalidIdempotencyKey' };
  }
  return null;
}

const NEW_GAME_EVENT_VALIDATORS: readonly EventValidator[] = [
  validateTypeIsPresent,
  validateTypeIsKnown,
  validateTableId,
  validatePayloadIsObject,
  validateHandIdIfRequired,
  validateOptionalUserId,
  validateOptionalSeatId,
  validateOptionalIdempotencyKey,
];

export type EventIngestionServiceDependencies = {
  eventStore: Pick<typeof eventStore, 'publishEvent' | 'publishEvents'>;
  recordIngestion: typeof recordIngestion;
};

type PublishEventResult = Awaited<
  ReturnType<EventIngestionServiceDependencies['eventStore']['publishEvent']>
>;
type PublishEventsResult = Awaited<
  ReturnType<EventIngestionServiceDependencies['eventStore']['publishEvents']>
>;

export class EventIngestionService {
  constructor(
    private readonly deps: EventIngestionServiceDependencies = { eventStore, recordIngestion },
  ) {}

  async ingestEvent(
    event: NewGameEvent,
  ): Promise<Result<PublishEventResult, EventValidationError>> {
    const validation = this.validateEvent(event);
    if (!validation.ok) {
      return validation;
    }
    const result = await this.deps.eventStore.publishEvent(event);
    this.deps.recordIngestion(event.type);
    return ok(result);
  }

  async ingestEvents(
    events: NewGameEvent[],
  ): Promise<Result<PublishEventsResult, EventValidationError>> {
    for (const event of events) {
      const validation = this.validateEvent(event);
      if (!validation.ok) {
        return validation;
      }
    }
    const results = await this.deps.eventStore.publishEvents(events);
    events.forEach((event) => this.deps.recordIngestion(event.type));
    return ok(results);
  }

  private validateEvent(event: NewGameEvent): Result<NewGameEvent, EventValidationError> {
    for (const validate of NEW_GAME_EVENT_VALIDATORS) {
      const error = validate(event);
      if (error) {
        return err(error);
      }
    }
    return ok(event);
  }
}

export const eventIngestionService = new EventIngestionService();
