# Data Model: Balance Service

## Entities

### Account

- **Fields**: accountId, balance, currency, version, createdAt, updatedAt
- **Validation**: balance >= 0, currency required (default "CHIPS"), version >= 0
- **Relationships**: 1:N with Transaction, 1:N with Reservation

```typescript
interface Account {
  accountId: string;      // = userId from poker service
  balance: number;        // Current available balance (smallest unit)
  currency: string;       // "CHIPS" for play-money
  version: number;        // Optimistic locking version
  createdAt: string;      // ISO timestamp
  updatedAt: string;      // ISO timestamp
}
```

### Transaction

- **Fields**: transactionId, idempotencyKey, type, accountId, amount,
  balanceBefore, balanceAfter, metadata, status, createdAt, completedAt
- **Validation**: amount > 0, balanceAfter >= 0, type required
- **Relationships**: N:1 with Account
- **Notes**: Immutable after creation; status transitions only PENDING -> COMPLETED/FAILED

```typescript
type TransactionType =
  | "DEPOSIT"       // External chip addition
  | "WITHDRAW"      // External chip removal
  | "BUY_IN"        // Table buy-in (balance -> table stack)
  | "CASH_OUT"      // Table cash-out (table stack -> balance)
  | "BLIND"         // Blind posting
  | "BET"           // Bet/raise contribution
  | "POT_WIN"       // Pot winnings
  | "REFUND";       // Reservation release or error recovery

type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED";

interface Transaction {
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

interface TransactionMetadata {
  tableId?: string;
  handId?: string;
  seatId?: number;
  reservationId?: string;
  reason?: string;
}
```

### Reservation

- **Fields**: reservationId, accountId, amount, tableId, expiresAt, status,
  createdAt, committedAt, releasedAt
- **Validation**: amount > 0, expiresAt > createdAt
- **Relationships**: N:1 with Account
- **Notes**: Status transitions: HELD -> COMMITTED or HELD -> RELEASED/EXPIRED

```typescript
type ReservationStatus = "HELD" | "COMMITTED" | "RELEASED" | "EXPIRED";

interface Reservation {
  reservationId: string;
  accountId: string;
  amount: number;
  tableId: string;
  idempotencyKey: string;
  expiresAt: string;        // ISO timestamp
  status: ReservationStatus;
  createdAt: string;
  committedAt: string | null;
  releasedAt: string | null;
}
```

### TablePot

- **Fields**: potId, tableId, handId, contributions, pots, status, version,
  createdAt, settledAt
- **Validation**: contributions values >= 0, status required
- **Notes**: Created when hand starts, settled or cancelled when hand ends

```typescript
type TablePotStatus = "ACTIVE" | "SETTLED" | "CANCELLED";

interface Pot {
  amount: number;
  eligibleSeatIds: number[];
}

interface TablePot {
  potId: string;            // = `${tableId}:${handId}`
  tableId: string;
  handId: string;
  contributions: Record<number, number>;  // seatId -> total contributed
  pots: Pot[];              // Calculated pots for settlement
  status: TablePotStatus;
  version: number;
  createdAt: string;
  settledAt: string | null;
}
```

### LedgerEntry

- **Fields**: entryId, transactionId, accountId, type, amount, balanceBefore,
  balanceAfter, metadata, timestamp, previousChecksum, checksum
- **Validation**: checksum must be valid hash of entry + previousChecksum
- **Notes**: Append-only; checksum chain ensures integrity

```typescript
interface LedgerEntry {
  entryId: string;
  transactionId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  metadata: TransactionMetadata;
  timestamp: string;
  previousChecksum: string;   // Checksum of previous entry (or "GENESIS")
  checksum: string;           // SHA-256 of this entry + previousChecksum
}
```

## Storage Notes

- **Accounts**: Redis hash `balance:accounts` with JSON values, in-memory cache.
- **Transactions**: Redis sorted set per account by timestamp, hash for lookup.
- **Reservations**: Redis hash with expiry sorted set for background cleanup.
- **Table Pots**: Redis hash keyed by `tableId:handId`.
- **Ledger**: Redis list per account (append-only), global sorted set by timestamp.
- **Idempotency**: Redis strings with 24h TTL keyed by idempotency key.

## Redis Key Namespace

```
balance:accounts:{accountId}              # Account JSON
balance:accounts:ids                      # Set of all account IDs

balance:transactions:{transactionId}      # Transaction JSON
balance:transactions:by-account:{id}      # Sorted set (timestamp -> txId)
balance:transactions:idempotency:{key}    # Cached response (24h TTL)

balance:reservations:{reservationId}      # Reservation JSON
balance:reservations:by-account:{id}      # Set of reservation IDs
balance:reservations:expiry               # Sorted set (expiry -> reservationId)

balance:pots:{tableId}:{handId}           # TablePot JSON
balance:pots:active                       # Set of active pot keys

balance:ledger:{accountId}                # List of LedgerEntry JSON
balance:ledger:latest-checksum:{id}       # Latest checksum for account
balance:ledger:global                     # Sorted set (timestamp -> entryId)
```

## Relationships

- **Account** 1:N **Transaction**
- **Account** 1:N **Reservation**
- **Account** 1:N **LedgerEntry**
- **TablePot** 1:N **Transaction** (via metadata.handId)

## State Transitions

### Transaction Status
- PENDING -> COMPLETED (on successful balance update)
- PENDING -> FAILED (on validation failure or error)

### Reservation Status
- HELD -> COMMITTED (on successful buy-in)
- HELD -> RELEASED (on explicit release by poker service)
- HELD -> EXPIRED (on timeout by background job)

### TablePot Status
- ACTIVE -> SETTLED (on successful pot distribution)
- ACTIVE -> CANCELLED (on hand cancellation)

## Consistency Guarantees

- **Account balance**: Updated atomically with optimistic locking (version check)
- **Transactions**: Idempotent via idempotency key lookup before execution
- **Reservations**: Background job expires stale reservations every 5 seconds
- **Ledger**: Checksum chain verified on append; corruption detectable
