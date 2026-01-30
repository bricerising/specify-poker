import { dispatchByType, dispatchByTypeNoCtx } from '@specify-poker/shared/pipeline';

import type {
  Card,
  GameEvent,
  HandRecord,
  HandStartedPayload,
  PotAwardedPayload,
} from '../domain/types';
import { isRecord } from '../errors';

type ParticipantRecord = {
  seatId: number;
  userId: string;
  nickname: string;
  startingStack: number;
  endingStack: number;
  holeCards: Card[] | null;
  actions: { street: string; action: string; amount: number; timestamp: string }[];
  result: 'WON' | 'LOST' | 'FOLDED' | 'SPLIT';
};

type AggregationContext = {
  participants: Map<string, ParticipantRecord>;
  participantsBySeat: Map<number, string>;
  communityCards: Card[];
  pots: { amount: number; winners: string[] }[];
  winners: { userId: string; amount: number }[];
};

const MATERIALIZABLE_EVENT_TYPES = [
  'HAND_STARTED',
  'CARDS_DEALT',
  'ACTION_TAKEN',
  'STREET_ADVANCED',
  'SHOWDOWN',
  'POT_AWARDED',
  'HAND_COMPLETED',
] as const;

type MaterializableEventType = (typeof MATERIALIZABLE_EVENT_TYPES)[number];

const MATERIALIZABLE_EVENT_TYPE_SET: ReadonlySet<string> = new Set(MATERIALIZABLE_EVENT_TYPES);

function isMaterializableEventType(type: string): type is MaterializableEventType {
  return MATERIALIZABLE_EVENT_TYPE_SET.has(type);
}

type MaterializerEvent =
  | {
      readonly type: 'HAND_STARTED';
      readonly timestamp: Date;
      readonly payload: {
        readonly seats: {
          readonly seatId: number;
          readonly userId: string;
          readonly nickname?: string;
          readonly stack: number;
        }[];
      };
    }
  | {
      readonly type: 'CARDS_DEALT';
      readonly timestamp: Date;
      readonly userId: string;
      readonly payload: {
        readonly cards: Card[] | null;
      };
    }
  | {
      readonly type: 'ACTION_TAKEN';
      readonly timestamp: Date;
      readonly userId: string;
      readonly payload: {
        readonly street: string;
        readonly action: string;
        readonly amount: number;
      };
    }
  | {
      readonly type: 'STREET_ADVANCED';
      readonly timestamp: Date;
      readonly payload: {
        readonly communityCards: Card[];
      };
    }
  | {
      readonly type: 'SHOWDOWN';
      readonly timestamp: Date;
      readonly payload: {
        readonly reveals: {
          readonly seatId: number;
          readonly cards: Card[];
        }[];
      };
    }
  | {
      readonly type: 'POT_AWARDED';
      readonly timestamp: Date;
      readonly payload: {
        readonly amount: number;
        readonly winners: {
          readonly seatId: number;
          readonly share: number;
          readonly userId?: string;
        }[];
      };
    }
  | {
      readonly type: 'HAND_COMPLETED';
      readonly timestamp: Date;
      readonly payload: {
        readonly playerEndStacks: Record<string, number> | null;
      };
    };

type MaterializerEventHandlerMap = {
  [Type in MaterializableEventType]: (
    ctx: AggregationContext,
    event: Extract<MaterializerEvent, { type: Type }>,
  ) => void;
};

function resolveUserId(
  userId: string | undefined,
  seatId: number,
  participantsBySeat: Map<number, string>,
): string | undefined {
  return userId || participantsBySeat.get(seatId);
}

const materializerEventHandlers: MaterializerEventHandlerMap = {
  HAND_STARTED: (ctx, event) => {
    for (const seat of event.payload.seats) {
      ctx.participants.set(seat.userId, {
        seatId: seat.seatId,
        userId: seat.userId,
        nickname: seat.nickname || `Player ${seat.seatId}`,
        startingStack: seat.stack,
        endingStack: seat.stack,
        holeCards: null,
        actions: [],
        result: 'LOST',
      });
      ctx.participantsBySeat.set(seat.seatId, seat.userId);
    }
  },
  CARDS_DEALT: (ctx, event) => {
    const participant = ctx.participants.get(event.userId);
    if (participant) {
      participant.holeCards = event.payload.cards;
    }
  },
  ACTION_TAKEN: (ctx, event) => {
    const participant = ctx.participants.get(event.userId);
    if (!participant) {
      return;
    }
    participant.actions.push({
      street: event.payload.street,
      action: event.payload.action,
      amount: event.payload.amount,
      timestamp: event.timestamp.toISOString(),
    });
    if (event.payload.action === 'FOLD') {
      participant.result = 'FOLDED';
    }
  },
  STREET_ADVANCED: (ctx, event) => {
    ctx.communityCards.push(...event.payload.communityCards);
  },
  SHOWDOWN: (ctx, event) => {
    for (const reveal of event.payload.reveals) {
      const userId = ctx.participantsBySeat.get(reveal.seatId);
      const participant = userId ? ctx.participants.get(userId) : undefined;
      if (participant) {
        participant.holeCards = reveal.cards;
      }
    }
  },
  POT_AWARDED: (ctx, event) => {
    const resolvedWinnerIds = event.payload.winners
      .map((winner) => resolveUserId(winner.userId, winner.seatId, ctx.participantsBySeat))
      .filter((winnerId): winnerId is string => Boolean(winnerId));
    const uniqueWinnerIds = Array.from(new Set(resolvedWinnerIds));

    ctx.pots.push({
      amount: event.payload.amount,
      winners: uniqueWinnerIds,
    });

    const isSplitPot = uniqueWinnerIds.length > 1;
    for (const winner of event.payload.winners) {
      const userId = resolveUserId(winner.userId, winner.seatId, ctx.participantsBySeat);
      if (!userId) {
        continue;
      }
      ctx.winners.push({ userId, amount: winner.share });

      const participant = ctx.participants.get(userId);
      if (!participant || participant.result === 'FOLDED') {
        continue;
      }
      if (isSplitPot) {
        participant.result = 'SPLIT';
        continue;
      }
      if (participant.result !== 'SPLIT') {
        participant.result = 'WON';
      }
    }
  },
  HAND_COMPLETED: (ctx, event) => {
    const endStacks = event.payload.playerEndStacks;
    if (!endStacks) {
      return;
    }
    for (const [userId, stack] of Object.entries(endStacks)) {
      const participant = ctx.participants.get(userId);
      if (participant) {
        participant.endingStack = stack;
      }
    }
  },
};

function dispatchMaterializerEvent(ctx: AggregationContext, event: MaterializerEvent): void {
  dispatchByType(materializerEventHandlers, ctx, event);
}

type HandStartedPayloadCompat = HandStartedPayload & {
  small_blind?: unknown;
  big_blind?: unknown;
  ante?: unknown;
  tableName?: unknown;
  table_name?: unknown;
};

function adaptHandStartedConfig(payload: unknown): {
  tableName: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
} {
  const compat = (payload ?? {}) as Partial<HandStartedPayloadCompat>;

  const numberValue = (value: unknown, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  };

  const stringValue = (value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback;

  const smallBlind = numberValue(compat.smallBlind ?? compat.small_blind, 0);
  const bigBlind = numberValue(compat.bigBlind ?? compat.big_blind, 0);
  const ante = numberValue(compat.ante, 0);
  const tableName = stringValue(compat.tableName ?? compat.table_name, 'Unknown Table');

  return { tableName, smallBlind, bigBlind, ante };
}

type MaterializableGameEvent = GameEvent & {
  [Type in MaterializableEventType]: { type: Type };
}[MaterializableEventType];

type MaterializerEventDecoderMap = {
  [Type in MaterializableEventType]: (
    event: Extract<MaterializableGameEvent, { type: Type }>,
  ) => Extract<MaterializerEvent, { type: Type }> | null;
};

const materializerEventDecoders: MaterializerEventDecoderMap = {
  HAND_STARTED: (event) => ({
    type: 'HAND_STARTED',
    timestamp: event.timestamp,
    payload: { seats: decodeHandStartedSeats(event.payload) },
  }),
  CARDS_DEALT: (event) => {
    if (typeof event.userId !== 'string' || event.userId.trim().length === 0) {
      return null;
    }
    return {
      type: 'CARDS_DEALT',
      timestamp: event.timestamp,
      userId: event.userId,
      payload: { cards: decodeCardsDealtCards(event.payload) },
    };
  },
  ACTION_TAKEN: (event) => {
    if (typeof event.userId !== 'string' || event.userId.trim().length === 0) {
      return null;
    }
    const payload = decodeActionTakenPayload(event.payload);
    if (!payload) {
      return null;
    }
    return {
      type: 'ACTION_TAKEN',
      timestamp: event.timestamp,
      userId: event.userId,
      payload,
    };
  },
  STREET_ADVANCED: (event) => {
    const communityCards = decodeCommunityCards(event.payload);
    if (!communityCards) {
      return null;
    }
    return {
      type: 'STREET_ADVANCED',
      timestamp: event.timestamp,
      payload: { communityCards },
    };
  },
  SHOWDOWN: (event) => {
    const reveals = decodeShowdownReveals(event.payload);
    if (!reveals) {
      return null;
    }
    return {
      type: 'SHOWDOWN',
      timestamp: event.timestamp,
      payload: { reveals },
    };
  },
  POT_AWARDED: (event) => {
    const payload = decodePotAwardedPayload(event.payload);
    if (!payload) {
      return null;
    }
    return {
      type: 'POT_AWARDED',
      timestamp: event.timestamp,
      payload,
    };
  },
  HAND_COMPLETED: (event) => ({
    type: 'HAND_COMPLETED',
    timestamp: event.timestamp,
    payload: { playerEndStacks: decodePlayerEndStacks(event.payload) },
  }),
};

function decodeMaterializerEvent(event: GameEvent): MaterializerEvent | null {
  if (!isMaterializableEventType(event.type)) {
    return null;
  }
  return dispatchByTypeNoCtx(materializerEventDecoders, event as MaterializableGameEvent);
}

function decodeHandStartedSeats(payload: unknown): HandStartedPayload['seats'] {
  if (!isRecord(payload)) {
    return [];
  }

  const seatsValue = payload.seats;
  if (!Array.isArray(seatsValue)) {
    return [];
  }

  const seats: HandStartedPayload['seats'] = [];
  for (const seat of seatsValue) {
    if (!isRecord(seat)) {
      continue;
    }

    const seatId = decodeSeatId(seat.seatId ?? seat.seat_id);
    const userId = decodeNonEmptyString(seat.userId ?? seat.user_id);
    const stack = decodeFiniteNumber(seat.stack);
    if (seatId === null) {
      continue;
    }
    if (!userId) {
      continue;
    }
    if (stack === null) {
      continue;
    }
    const nickname = decodeNonEmptyString(seat.nickname) ?? undefined;

    seats.push({ seatId, userId, stack, ...(nickname ? { nickname } : {}) });
  }
  return seats;
}

function decodeCardList(value: unknown): Card[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const cards: Card[] = [];
  for (const entry of value) {
    const card = decodeCard(entry);
    if (!card) {
      return null;
    }
    cards.push(card);
  }

  return cards;
}

function decodeCardsDealtCards(payload: unknown): Card[] | null {
  if (!isRecord(payload)) {
    return null;
  }
  return decodeCardList(payload.cards);
}

function decodeActionTakenPayload(
  payload: unknown,
): Extract<MaterializerEvent, { type: 'ACTION_TAKEN' }>['payload'] | null {
  if (!isRecord(payload)) {
    return null;
  }
  const action = decodeNonEmptyString(payload.action);
  if (!action) {
    return null;
  }
  const street = decodeNonEmptyString(payload.street) ?? 'unknown';
  const amount = decodeFiniteNumber(payload.amount) ?? 0;

  return { street, action, amount };
}

function decodeCommunityCards(payload: unknown): Card[] | null {
  if (!isRecord(payload)) {
    return null;
  }
  return decodeCardList(payload.communityCards);
}

function decodeShowdownReveals(
  payload: unknown,
): Extract<MaterializerEvent, { type: 'SHOWDOWN' }>['payload']['reveals'] | null {
  if (!isRecord(payload)) {
    return null;
  }
  const revealsValue = payload.reveals;
  if (!Array.isArray(revealsValue)) {
    return null;
  }
  const reveals: Extract<MaterializerEvent, { type: 'SHOWDOWN' }>['payload']['reveals'] = [];
  for (const reveal of revealsValue) {
    if (!isRecord(reveal)) {
      continue;
    }
    const seatId = decodeSeatId(reveal.seatId ?? reveal.seat_id);
    if (seatId === null) {
      continue;
    }
    if (!Array.isArray(reveal.cards)) {
      continue;
    }

    const cards = decodeCardList(reveal.cards);
    if (!cards) {
      return null;
    }
    reveals.push({ seatId, cards });
  }
  return reveals;
}

function decodePotAwardedPayload(
  payload: unknown,
): Extract<MaterializerEvent, { type: 'POT_AWARDED' }>['payload'] | null {
  if (!isRecord(payload)) {
    return null;
  }
  const amount = decodeFiniteNumber(payload.amount);
  if (amount === null) {
    return null;
  }
  const winnersValue = payload.winners;
  if (!Array.isArray(winnersValue)) {
    return null;
  }

  const winners: PotAwardedPayload['winners'] = [];
  for (const winner of winnersValue) {
    if (!isRecord(winner)) {
      continue;
    }
    const seatId = decodeSeatId(winner.seatId ?? winner.seat_id);
    const share = decodeFiniteNumber(winner.share);
    if (seatId === null) {
      continue;
    }
    if (share === null) {
      continue;
    }
    const userId = decodeNonEmptyString(winner.userId ?? winner.user_id) ?? undefined;
    winners.push({ seatId, share, ...(userId ? { userId } : {}) });
  }

  return { amount, winners };
}

function decodePlayerEndStacks(payload: unknown): Record<string, number> | null {
  if (!isRecord(payload)) {
    return null;
  }

  const endStacksValue = payload.playerEndStacks ?? payload.player_end_stacks;
  if (!isRecord(endStacksValue)) {
    return null;
  }

  const endStacks: Record<string, number> = {};
  for (const [userId, stackValue] of Object.entries(endStacksValue)) {
    const stack = decodeFiniteNumber(stackValue);
    if (stack === null) {
      continue;
    }
    endStacks[userId] = stack;
  }

  return Object.keys(endStacks).length > 0 ? endStacks : null;
}

function decodeSeatId(value: unknown): number | null {
  const seatId = decodeFiniteNumber(value);
  if (seatId === null || !Number.isInteger(seatId) || seatId < 0) {
    return null;
  }
  return seatId;
}

function decodeCard(value: unknown): Card | null {
  if (!isRecord(value)) {
    return null;
  }
  const rank = decodeNonEmptyString(value.rank);
  const suit = decodeNonEmptyString(value.suit);
  if (!rank || !suit) {
    return null;
  }
  return { rank, suit };
}

function decodeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function aggregateHandRecord(
  handId: string,
  tableId: string,
  events: GameEvent[],
): HandRecord {
  const startedEvent = events.find((event) => event.type === 'HAND_STARTED');
  const completedEvent = events.find((event) => event.type === 'HAND_COMPLETED');

  const ctx: AggregationContext = {
    participants: new Map(),
    participantsBySeat: new Map(),
    communityCards: [],
    pots: [],
    winners: [],
  };

  for (const event of events) {
    const decoded = decodeMaterializerEvent(event);
    if (!decoded) {
      continue;
    }
    dispatchMaterializerEvent(ctx, decoded);
  }

  const config = adaptHandStartedConfig(startedEvent?.payload);

  return {
    handId,
    tableId,
    tableName: config.tableName,
    config: {
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      ante: config.ante,
    },
    participants: Array.from(ctx.participants.values()),
    communityCards: ctx.communityCards,
    pots: ctx.pots,
    winners: ctx.winners,
    startedAt: startedEvent?.timestamp || new Date(),
    completedAt: completedEvent?.timestamp || new Date(),
    duration:
      completedEvent && startedEvent
        ? completedEvent.timestamp.getTime() - startedEvent.timestamp.getTime()
        : 0,
  };
}
