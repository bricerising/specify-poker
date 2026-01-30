import type {
  ProtoCursor,
  ProtoGameEvent,
  ProtoHandRecord,
  ProtoTimestamp,
} from '../types';

export function toTimestamp(date: Date): ProtoTimestamp {
  return { seconds: Math.floor(date.getTime() / 1000), nanos: 0 };
}

export function mapEventToProto(event: {
  eventId: string;
  type: string;
  tableId: string;
  handId?: string | null;
  userId?: string | null;
  seatId?: number | null;
  payload: unknown;
  timestamp: Date;
  sequence?: number | null;
}): ProtoGameEvent {
  return {
    eventId: event.eventId,
    type: event.type,
    tableId: event.tableId,
    handId: event.handId ?? undefined,
    userId: event.userId ?? undefined,
    seatId: event.seatId ?? undefined,
    payload: event.payload,
    timestamp: toTimestamp(event.timestamp),
    sequence: event.sequence ?? 0,
  };
}

export function mapCursorToProto(cursor: {
  cursorId: string;
  streamId: string;
  subscriberId: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): ProtoCursor {
  return {
    cursorId: cursor.cursorId,
    streamId: cursor.streamId,
    subscriberId: cursor.subscriberId,
    position: cursor.position,
    createdAt: toTimestamp(cursor.createdAt),
    updatedAt: toTimestamp(cursor.updatedAt),
  };
}

type CardLike = { rank: string; suit: string };

function suitToChar(suit: string): string {
  const normalizedSuit = suit.trim().toLowerCase();
  if (normalizedSuit.startsWith('h')) {
    return 'h';
  }
  if (normalizedSuit.startsWith('d')) {
    return 'd';
  }
  if (normalizedSuit.startsWith('c')) {
    return 'c';
  }
  if (normalizedSuit.startsWith('s')) {
    return 's';
  }
  return normalizedSuit.charAt(0);
}

function cardToString(card: CardLike): string {
  const rank = card.rank.trim();
  const suitChar = suitToChar(card.suit);
  return `${rank}${suitChar}`;
}

function cardsToStrings(cards: CardLike[] | null | undefined): string[] {
  return (cards ?? []).map(cardToString);
}

export function mapHandRecordToProto(r: {
  handId: string;
  tableId: string;
  tableName: string;
  config: { smallBlind: number; bigBlind: number; ante: number };
  participants: {
    seatId: number;
    userId: string;
    nickname: string;
    startingStack: number;
    endingStack: number;
    holeCards: { rank: string; suit: string }[] | null;
    actions: { street: string; action: string; amount: number; timestamp: string }[];
    result: string;
  }[];
  communityCards: { rank: string; suit: string }[];
  pots: { amount: number; winners: string[] }[];
  winners: { userId: string; amount: number }[];
  startedAt: Date;
  completedAt: Date;
  duration: number;
}): ProtoHandRecord {
  return {
    handId: r.handId,
    tableId: r.tableId,
    tableName: r.tableName,
    config: r.config,
    participants: r.participants.map((p) => ({
      seatId: p.seatId,
      userId: p.userId,
      nickname: p.nickname,
      startingStack: p.startingStack,
      endingStack: p.endingStack,
      holeCards: cardsToStrings(p.holeCards),
      actions: p.actions.map((a) => ({
        street: a.street,
        action: a.action,
        amount: a.amount,
        timestamp: toTimestamp(new Date(a.timestamp)),
      })),
      result: p.result,
    })),
    communityCards: cardsToStrings(r.communityCards),
    pots: r.pots.map((p) => ({
      amount: p.amount,
      winners: p.winners,
    })),
    winners: r.winners.map((w) => ({
      userId: w.userId,
      amount: w.amount,
    })),
    startedAt: toTimestamp(new Date(r.startedAt)),
    completedAt: toTimestamp(new Date(r.completedAt)),
    durationMs: r.duration,
  };
}
