// Account - User's chip balance
export interface Account {
  accountId: string;
  balance: number;
  currency: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Transaction types
export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'BUY_IN'
  | 'CASH_OUT'
  | 'BLIND'
  | 'BET'
  | 'POT_WIN'
  | 'RAKE'
  | 'BONUS'
  | 'REFERRAL'
  | 'REFUND';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface TransactionMetadata {
  tableId?: string;
  handId?: string;
  seatId?: number;
  reservationId?: string;
  reason?: string;
  source?: string;
}

export interface Transaction {
  transactionId: string;
  idempotencyKey: string;
  type: TransactionType;
  accountId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  metadata: TransactionMetadata;
  status: TransactionStatus;
  createdAt: string;
  completedAt: string | null;
}

// Reservation - Two-phase buy-in
export type ReservationStatus = 'HELD' | 'COMMITTED' | 'RELEASED' | 'EXPIRED';

export interface Reservation {
  reservationId: string;
  accountId: string;
  amount: number;
  tableId: string;
  idempotencyKey: string;
  expiresAt: string;
  status: ReservationStatus;
  createdAt: string;
  committedAt: string | null;
  releasedAt: string | null;
}

// Table Pot
export type TablePotStatus = 'ACTIVE' | 'SETTLED' | 'CANCELLED';

export interface Pot {
  amount: number;
  eligibleSeatIds: number[];
}

export interface TablePot {
  potId: string;
  tableId: string;
  handId: string;
  contributions: Record<number, number>;
  pots: Pot[];
  rakeAmount: number;
  status: TablePotStatus;
  version: number;
  createdAt: string;
  settledAt: string | null;
}

// Ledger Entry - Audit trail
export interface LedgerEntry {
  entryId: string;
  transactionId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  metadata: TransactionMetadata;
  timestamp: string;
  previousChecksum: string;
  checksum: string;
}

// Service operation results - discriminated union for type-safe error handling
export type OperationResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface BalanceInfo {
  accountId: string;
  balance: number;
  availableBalance: number;
  currency: string;
  version: number;
}

export type ReservationResult =
  | { ok: true; reservationId: string; availableBalance: number }
  | { ok: false; error: string; availableBalance?: number };

export type CommitResult =
  | { ok: true; transactionId: string; newBalance?: number }
  | { ok: false; error: string };

export type ReleaseResult = { ok: true; availableBalance?: number } | { ok: false; error: string };

export type CashOutResult =
  | { ok: true; transactionId: string; newBalance: number }
  | { ok: false; error: string };

export type ContributionResult =
  | { ok: true; totalPot: number; seatContribution: number }
  | { ok: false; error: string };

export interface SettlementWinner {
  seatId: number;
  accountId: string;
  amount: number;
}

export interface SettlementResultItem {
  accountId: string;
  transactionId: string;
  amount: number;
  newBalance: number;
}

export type SettlePotResult =
  | { ok: true; results: SettlementResultItem[] }
  | { ok: false; error: string };
