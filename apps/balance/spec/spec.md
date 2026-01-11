# Feature Specification: Balance Service

**Service**: `@specify-poker/balance`
**Created**: 2026-01-11
**Status**: In Development

## Overview

The Balance Service manages user account balances, table pot tracking, and
transaction ledger for the poker application. It provides a real-money ready
design with strict audit trails, idempotency, and distributed consistency.

## User Scenarios & Testing

### User Story 1 - Account Balance Management (Priority: P1)

As a player, I can have a persistent chip balance that carries across table sessions,
allowing me to buy in and cash out from tables while tracking my overall winnings.

**Why this priority**: Core functionality that enables the service to exist; without
persistent balances the service has no purpose.

**Independent Test**: A user deposits chips, joins a table (balance decreases), wins
a hand, leaves the table (balance increases), and can see their transaction history.

**Acceptance Scenarios**:

1. **Given** a user with sufficient balance, **When** they join a table, **Then**
   their account balance is reduced by the buy-in amount and the table seat stack
   is initialized.
2. **Given** a user seated at a table, **When** they leave the table, **Then** their
   remaining stack is credited to their account balance.
3. **Given** a user, **When** they query their transaction history, **Then** they
   see an ordered list of all balance changes with timestamps and context.

---

### User Story 2 - Table Pot Management (Priority: P1)

As a poker game, I can track pot contributions and settle winnings through the
balance service to maintain a complete audit trail of chip movement.

**Why this priority**: Pot management is integral to game integrity and audit
requirements for real-money readiness.

**Independent Test**: A complete hand is played with multiple betting rounds, pots
are calculated correctly, and winners receive their share with all transactions
logged.

**Acceptance Scenarios**:

1. **Given** an active hand, **When** a player bets or calls, **Then** the
   contribution is recorded in the balance service with full metadata.
2. **Given** a hand reaching showdown, **When** winners are determined, **Then**
   the pot is distributed and each winner's account is credited atomically.
3. **Given** a hand where one player folds to win, **When** the hand ends, **Then**
   the full pot is credited to the winner without showdown.

---

### User Story 3 - Two-Phase Buy-In (Priority: P2)

As the poker service, I can reserve funds before confirming a seat join to prevent
race conditions and ensure atomicity across distributed services.

**Why this priority**: Two-phase commit ensures consistency between balance and
table state, critical for real-money operations.

**Independent Test**: A reservation is created, the seat join fails, and the
reservation is released without affecting the user's available balance permanently.

**Acceptance Scenarios**:

1. **Given** a user requesting to join a table, **When** the balance service
   reserves funds, **Then** those funds are unavailable for other operations until
   committed or released.
2. **Given** an active reservation, **When** the seat join succeeds, **Then** the
   reservation is committed and becomes a permanent transaction.
3. **Given** an active reservation, **When** the seat join fails or times out,
   **Then** the reservation is released and funds become available again.

---

### Edge Cases

- User attempts to join table with insufficient balance.
- Reservation expires before commit/release is called.
- Balance service is unavailable during buy-in attempt.
- Concurrent buy-in requests from the same user to multiple tables.
- Settlement request with duplicate idempotency key (retry scenario).
- User disconnects mid-hand with chips in pot.
- Split pot with odd chip remainder.
- All-in player wins side pot but not main pot.

## Constitution Requirements

- **Audit Trail**: Every balance change MUST be recorded in an append-only ledger
  with checksums for integrity verification.
- **Idempotency**: All mutating operations MUST be idempotent via client-provided
  idempotency keys with 24-hour deduplication.
- **Consistency**: Account balances MUST never go negative; all debits MUST be
  validated against available balance.
- **Atomicity**: Pot settlements MUST be atomic - either all winners are credited
  or none are.
- **Observability**: All operations MUST emit OpenTelemetry traces and Prometheus
  metrics.

## Requirements

### Functional Requirements

- **FR-001**: System MUST maintain persistent account balances per user.
- **FR-002**: System MUST support deposit operations to add chips to an account.
- **FR-003**: System MUST support withdrawal operations to remove chips from an
  account with balance validation.
- **FR-004**: System MUST support two-phase buy-in with reserve/commit/release
  operations.
- **FR-005**: System MUST expire unreleased reservations after a configurable
  timeout (default 30 seconds).
- **FR-006**: System MUST record all pot contributions with table, hand, seat,
  and amount metadata.
- **FR-007**: System MUST support pot settlement with multiple winners and
  remainder distribution.
- **FR-008**: System MUST maintain an append-only transaction ledger with
  checksums.
- **FR-009**: System MUST support idempotent operations via client-provided keys.
- **FR-010**: System MUST expose gRPC API for internal poker service communication.
- **FR-011**: System MUST expose HTTP API for external account management.
- **FR-012**: System MUST provide transaction history queries by account.
- **FR-013**: System MUST use optimistic locking to prevent concurrent balance
  updates.
- **FR-014**: System MUST reject operations that would result in negative balance.
- **FR-015**: System MUST support graceful degradation when Redis is unavailable.

### Key Entities

- **Account**: User account with balance, currency, and version for locking.
- **Transaction**: Immutable record of a balance change with type and metadata.
- **Reservation**: Temporary hold on funds for two-phase buy-in operations.
- **TablePot**: Active pot state for a hand including contributions and eligibility.
- **LedgerEntry**: Append-only audit record with checksum chain.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 99.9% of balance operations complete within 100ms.
- **SC-002**: 100% of transactions are recorded in the ledger with valid checksums.
- **SC-003**: 0% of accounts ever have negative balances.
- **SC-004**: 99% of reservation expirations are processed within 5 seconds of
  deadline.
- **SC-005**: Idempotent retry of any operation produces identical results.

## Assumptions

- Currency is "CHIPS" for play-money; real-money would use ISO currency codes.
- Initial account balance is 0; users must deposit chips to play.
- Reservation timeout is 30 seconds by default.
- Idempotency keys are retained for 24 hours.
- gRPC is used for internal communication for lower latency than HTTP.
