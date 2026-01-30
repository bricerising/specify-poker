import { eventStore } from '../storage/eventStore';
import type { GameEvent, HandRecord } from '../domain/types';
import { isRecord } from '../errors';

function isParticipant(record: HandRecord, userId?: string): boolean {
  return Boolean(
    userId && record.participants.some((participant) => participant.userId === userId),
  );
}

type EventVisibilityContext = {
  readonly requesterUserId?: string;
  readonly isOperator: boolean;
  readonly participantUserIds?: ReadonlySet<string>;
};

type EventFilter = (event: GameEvent) => GameEvent;

function redactCardsPayload(event: GameEvent): GameEvent {
  const payload = isRecord(event.payload) ? event.payload : {};
  return {
    ...event,
    payload: { ...payload, cards: [] },
  };
}

function redactShowdownPayload(event: GameEvent): GameEvent {
  const payload = isRecord(event.payload) ? event.payload : {};
  const revealsValue = payload.reveals;
  const reveals = Array.isArray(revealsValue) ? revealsValue : [];

  const redactedReveals = reveals.map((reveal) => {
    if (!isRecord(reveal)) {
      return { cards: [] };
    }
    return { ...reveal, cards: [] };
  });

  return {
    ...event,
    payload: { ...payload, reveals: redactedReveals },
  };
}

type EventRedactor = (event: GameEvent) => GameEvent;

const NON_PARTICIPANT_REDACTORS: Partial<Record<GameEvent['type'], EventRedactor>> = {
  CARDS_DEALT: redactCardsPayload,
  CARDS_REVEALED: redactCardsPayload,
  SHOWDOWN: redactShowdownPayload,
};

function redactEventForNonParticipant(event: GameEvent): GameEvent {
  const redactor = NON_PARTICIPANT_REDACTORS[event.type];
  return redactor ? redactor(event) : event;
}

function redactEventForParticipant(event: GameEvent, requesterUserId: string): GameEvent {
  if (event.type !== 'CARDS_DEALT') {
    return event;
  }
  if (event.userId === requesterUserId) {
    return event;
  }
  return redactCardsPayload(event);
}

function buildEventFilter(ctx: EventVisibilityContext): EventFilter {
  if (ctx.isOperator) {
    return (event) => event;
  }

  const requesterUserId = ctx.requesterUserId;
  if (requesterUserId && ctx.participantUserIds?.has(requesterUserId)) {
    return (event) => redactEventForParticipant(event, requesterUserId);
  }

  return redactEventForNonParticipant;
}

export type PrivacyServiceDependencies = {
  eventStore: Pick<typeof eventStore, 'getShowdownReveals'>;
};

export class PrivacyService {
  constructor(private readonly deps: PrivacyServiceDependencies = { eventStore }) {}

  createEventFilter(options: {
    requesterUserId?: string;
    isOperator: boolean;
    participantUserIds?: ReadonlySet<string>;
  }): (event: GameEvent) => GameEvent {
    return buildEventFilter(options);
  }

  async filterHandRecord(
    record: HandRecord,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<HandRecord> {
    if (isOperator) {
      return record;
    }

    if (!requesterUserId || !isParticipant(record, requesterUserId)) {
      return {
        ...record,
        participants: record.participants.map((participant) => ({
          ...participant,
          holeCards: null,
        })),
      };
    }

    const revealedSeats = await this.deps.eventStore.getShowdownReveals(record.handId);

    return {
      ...record,
      participants: record.participants.map((participant) => {
        const isVisible =
          participant.userId === requesterUserId || revealedSeats.has(participant.seatId);
        return isVisible ? participant : { ...participant, holeCards: null };
      }),
    };
  }

  filterEvent(
    event: GameEvent,
    requesterUserId?: string,
    isOperator = false,
    participantUserIds?: ReadonlySet<string>,
  ): GameEvent {
    return this.createEventFilter({ requesterUserId, isOperator, participantUserIds })(event);
  }
}

export const privacyService = new PrivacyService();
