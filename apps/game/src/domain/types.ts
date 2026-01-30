export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  maxPlayers: number;
  startingStack: number;
  turnTimerSeconds: number;
}

export type TableStatus = 'WAITING' | 'PLAYING' | 'PAUSED' | 'CLOSED';

export type SeatStatus =
  | 'EMPTY'
  | 'RESERVED'
  | 'SEATED'
  | 'ACTIVE'
  | 'FOLDED'
  | 'ALL_IN'
  | 'SITTING_OUT'
  | 'DISCONNECTED';

export type HandStreet = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN';

export const ACTION_TYPES = [
  'POST_BLIND',
  'FOLD',
  'CHECK',
  'CALL',
  'BET',
  'RAISE',
  'ALL_IN',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

const ACTION_TYPE_SET: ReadonlySet<ActionType> = new Set(ACTION_TYPES);

export function isActionType(value: string): value is ActionType {
  return ACTION_TYPE_SET.has(value as ActionType);
}

export interface Card {
  rank: string;
  suit: string;
}

export interface Table {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  status: TableStatus;
  createdAt: string;
}

export interface Seat {
  seatId: number;
  userId: string | null;
  stack: number;
  status: SeatStatus;
  holeCards: Card[] | null;
  reservationId?: string;
  buyInIdempotencyKey?: string;
  pendingBuyInAmount?: number;
  lastAction?: string;
}

export interface Spectator {
  userId: string;
  status: 'ACTIVE' | 'DISCONNECTED';
  joinedAt: string;
}

export interface Action {
  actionId: string;
  handId: string;
  seatId: number;
  userId: string;
  type: ActionType;
  amount: number;
  timestamp: string;
}

export interface Pot {
  amount: number;
  eligibleSeats: number[];
  winners?: number[];
}

export interface HandState {
  handId: string;
  tableId: string;
  street: HandStreet;
  communityCards: Card[];
  pots: Pot[];
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  turn: number;
  lastAggressor: number;
  actions: Action[];
  rakeAmount: number;
  startedAt: string;
  deck: Card[];
  roundContributions: Record<number, number>;
  totalContributions: Record<number, number>;
  actedSeats: number[];
  raiseCapped: boolean;
  endedAt?: string | null;
  winners?: number[];
}

export interface TableState {
  tableId: string;
  seats: Seat[];
  spectators: Spectator[];
  hand: HandState | null;
  button: number;
  version: number;
  updatedAt: string;
}

export type ActionInput =
  | { type: 'POST_BLIND'; amount: number }
  | { type: 'FOLD' }
  | { type: 'CHECK' }
  | { type: 'CALL' }
  | { type: 'BET'; amount: number }
  | { type: 'RAISE'; amount: number }
  | { type: 'ALL_IN'; amount?: number };

export interface TableSummary {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seatsTaken: number;
  occupiedSeatIds: number[];
  inProgress: boolean;
  spectatorCount: number;
}

export interface LegalAction {
  type: ActionType;
  minAmount?: number;
  maxAmount?: number;
}

// ============================================================================
// Seat Status Guards
// ============================================================================

/** Seat statuses that indicate the seat is participating in the current hand */
export const IN_HAND_STATUSES = ['ACTIVE', 'FOLDED', 'ALL_IN', 'DISCONNECTED'] as const;
export type InHandStatus = (typeof IN_HAND_STATUSES)[number];

/** Type guard for checking if a seat status indicates participation in hand */
export function isInHandStatus(status: SeatStatus): status is InHandStatus {
  return IN_HAND_STATUSES.includes(status as InHandStatus);
}

/** Seat statuses that can still act in the current betting round */
export const ACTIONABLE_STATUSES = ['ACTIVE'] as const;
export type ActionableStatus = (typeof ACTIONABLE_STATUSES)[number];

/** Type guard for checking if a seat can take actions */
export function isActionableStatus(status: SeatStatus): status is ActionableStatus {
  return status === 'ACTIVE';
}

// ============================================================================
// Runtime Type Guards (boundary validation)
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isTable(value: unknown): value is Table {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.tableId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.ownerId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.status === 'string' &&
    isRecord(value.config)
  );
}

export function isTableState(value: unknown): value is TableState {
  if (!isRecord(value)) {
    return false;
  }

  const hand = value.hand;
  if (hand !== null && hand !== undefined && !isRecord(hand)) {
    return false;
  }

  return (
    typeof value.tableId === 'string' &&
    Array.isArray(value.seats) &&
    Array.isArray(value.spectators) &&
    typeof value.button === 'number' &&
    typeof value.version === 'number' &&
    typeof value.updatedAt === 'string'
  );
}
