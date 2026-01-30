import { eventStore } from '../storage/eventStore';
import type { EventType, NewGameEvent } from '../domain/types';
import { isEventType } from '../domain/types';
import { recordIngestion } from '../observability/metrics';
import { InvalidArgumentError, isRecord } from '../errors';

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

type EventValidator = (event: NewGameEvent) => void;

function validateTypeIsPresent(event: NewGameEvent): void {
  if (!event.type) {
    throw new InvalidArgumentError('Event type is required');
  }
}

function validateTypeIsKnown(event: NewGameEvent): void {
  if (!isEventType(event.type)) {
    throw new InvalidArgumentError(`Unknown event type: ${event.type}`);
  }
}

function validateTableId(event: NewGameEvent): void {
  if (typeof event.tableId !== 'string' || event.tableId.trim().length === 0) {
    throw new InvalidArgumentError('Table ID is required');
  }
}

function validatePayloadIsObject(event: NewGameEvent): void {
  if (!isRecord(event.payload)) {
    throw new InvalidArgumentError('Payload must be an object');
  }
}

function validateHandIdIfRequired(event: NewGameEvent): void {
  const requiresHandId = HAND_EVENT_TYPES.has(event.type);
  if (!requiresHandId) {
    return;
  }
  if (typeof event.handId !== 'string' || event.handId.trim().length === 0) {
    throw new InvalidArgumentError(`handId is required for event type ${event.type}`);
  }
}

function validateOptionalUserId(event: NewGameEvent): void {
  if (event.userId === undefined || event.userId === null) {
    return;
  }
  if (typeof event.userId !== 'string' || event.userId.trim().length === 0) {
    throw new InvalidArgumentError('userId must be a non-empty string when provided');
  }
}

function validateOptionalSeatId(event: NewGameEvent): void {
  if (event.seatId === undefined || event.seatId === null) {
    return;
  }
  if (typeof event.seatId !== 'number' || !Number.isFinite(event.seatId)) {
    throw new InvalidArgumentError('seatId must be a number when provided');
  }
}

function validateOptionalIdempotencyKey(event: NewGameEvent): void {
  if (event.idempotencyKey === undefined || event.idempotencyKey === null) {
    return;
  }
  if (typeof event.idempotencyKey !== 'string' || event.idempotencyKey.trim().length === 0) {
    throw new InvalidArgumentError('idempotencyKey must be a non-empty string when provided');
  }
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

export class EventIngestionService {
  constructor(
    private readonly deps: EventIngestionServiceDependencies = { eventStore, recordIngestion },
  ) {}

  async ingestEvent(
    event: NewGameEvent,
  ): ReturnType<EventIngestionServiceDependencies['eventStore']['publishEvent']> {
    this.validateEvent(event);
    const result = await this.deps.eventStore.publishEvent(event);
    this.deps.recordIngestion(event.type);
    return result;
  }

  async ingestEvents(
    events: NewGameEvent[],
  ): ReturnType<EventIngestionServiceDependencies['eventStore']['publishEvents']> {
    for (const event of events) {
      this.validateEvent(event);
    }
    const results = await this.deps.eventStore.publishEvents(events);
    events.forEach((event) => this.deps.recordIngestion(event.type));
    return results;
  }

  private validateEvent(event: NewGameEvent): void {
    for (const validate of NEW_GAME_EVENT_VALIDATORS) {
      validate(event);
    }
  }
}

export const eventIngestionService = new EventIngestionService();
