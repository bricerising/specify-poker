export const EVENT_TYPES = [
  'HAND_STARTED',
  'CARDS_DEALT',
  'BLIND_POSTED',
  'ACTION_TAKEN',
  'STREET_ADVANCED',
  'CARDS_REVEALED',
  'SHOWDOWN',
  'POT_AWARDED',
  'HAND_COMPLETED',
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'PLAYER_SAT_OUT',
  'PLAYER_SAT_IN',
  'TABLE_CREATED',
  'TABLE_CLOSED',
  'TURN_STARTED',
  'RAKE_DEDUCTED',
  'BONUS_ISSUED',
  'REFERRAL_ISSUED',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

export type Street = string;
export type ActionType = string;

export interface Card {
  rank: string;
  suit: string;
}

export interface HandStartedPayload {
  button: number;
  seats: { seatId: number; userId: string; stack: number; nickname?: string }[];
  smallBlind: number;
  bigBlind: number;
}

export interface CardsDealtPayload {
  seatId: number;
  cards: Card[];
}

export interface BlindPostedPayload {
  seatId: number;
  amount: number;
  blindType: 'SMALL' | 'BIG' | 'ANTE';
}

export interface ActionTakenPayload {
  seatId: number;
  action: ActionType;
  amount: number;
  isAllIn: boolean;
  street?: Street;
}

export interface StreetAdvancedPayload {
  street: Street;
  communityCards: Card[];
}

export interface ShowdownPayload {
  reveals: { seatId: number; cards: Card[]; handRank: string }[];
}

export interface PotAwardedPayload {
  potIndex: number;
  amount: number;
  winners: { seatId: number; share: number; userId?: string }[];
}

export interface HandCompletedPayload {
  duration: number;
  totalPot: number;
  rake: number;
  playerEndStacks?: Record<string, number>;
}

export type EventPayload =
  | HandStartedPayload
  | CardsDealtPayload
  | BlindPostedPayload
  | ActionTakenPayload
  | StreetAdvancedPayload
  | ShowdownPayload
  | PotAwardedPayload
  | HandCompletedPayload
  | Record<string, unknown>;

export interface GameEvent {
  eventId: string;
  type: EventType;
  tableId: string;
  handId: string | null;
  userId: string | null;
  seatId: number | null;
  payload: EventPayload;
  timestamp: Date;
  sequence: number | null;
}

export interface NewGameEvent {
  type: EventType;
  tableId: string;
  handId?: string | null;
  userId?: string | null;
  seatId?: number | null;
  payload: EventPayload;
  idempotencyKey?: string | null;
}

export interface HandConfig {
  smallBlind: number;
  bigBlind: number;
  ante: number;
}

export interface ParticipantAction {
  street: Street;
  action: ActionType;
  amount: number;
  timestamp: string;
}

export interface HandParticipant {
  seatId: number;
  userId: string;
  nickname: string;
  startingStack: number;
  endingStack: number;
  holeCards: Card[] | null;
  actions: ParticipantAction[];
  result: 'WON' | 'LOST' | 'FOLDED' | 'SPLIT';
}

export interface Pot {
  amount: number;
  winners: string[];
}

export interface Winner {
  userId: string;
  amount: number;
}

export interface HandRecord {
  handId: string;
  tableId: string;
  tableName: string;
  config: HandConfig;
  participants: HandParticipant[];
  communityCards: Card[];
  pots: Pot[];
  winners: Winner[];
  startedAt: Date;
  completedAt: Date;
  duration: number;
}

export interface EventStream {
  streamId: string;
  context: 'TABLE' | 'HAND' | 'USER';
  contextId: string;
  latestSequence: number;
  createdAt: Date;
}

export interface Cursor {
  cursorId: string;
  streamId: string;
  subscriberId: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventQuery {
  tableId?: string;
  handId?: string;
  userId?: string;
  types?: EventType[];
  startTime?: Date;
  endTime?: Date;
  limit: number;
  offset?: number;
  cursor?: string;
}

export interface EventQueryResult {
  events: GameEvent[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}
