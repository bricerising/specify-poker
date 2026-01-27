export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  maxPlayers: number;
  startingStack: number;
  turnTimerSeconds: number;
}

export type TableStatus = "WAITING" | "PLAYING" | "PAUSED" | "CLOSED";

export type SeatStatus =
  | "EMPTY"
  | "RESERVED"
  | "SEATED"
  | "ACTIVE"
  | "FOLDED"
  | "ALL_IN"
  | "SITTING_OUT"
  | "DISCONNECTED";

export type HandStreet = "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";

export type ActionType =
  | "POST_BLIND"
  | "FOLD"
  | "CHECK"
  | "CALL"
  | "BET"
  | "RAISE"
  | "ALL_IN";

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
  status: "ACTIVE" | "DISCONNECTED";
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

export interface ActionInput {
  type: ActionType;
  amount?: number;
}

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
// Result Types (Discriminated Unions)
// ============================================================================

/** Generic success/failure result with typed error codes */
export type Result<T, E extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Service operation result for table operations */
export type TableOperationResult<E extends string = string> =
  | { ok: true }
  | { ok: false; error: E };

/** Common error codes for seat operations */
export type SeatJoinError =
  | "TABLE_NOT_FOUND"
  | "SEAT_NOT_AVAILABLE"
  | "ALREADY_SEATED"
  | "INSUFFICIENT_BALANCE"
  | "COMMIT_FAILED"
  | "TABLE_LOST"
  | "SEAT_LOST";

/** Common error codes for action submission */
export type ActionSubmitError =
  | "TABLE_NOT_FOUND"
  | "NO_HAND_IN_PROGRESS"
  | "PLAYER_NOT_AT_TABLE"
  | "INVALID_ACTION";
