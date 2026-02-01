# Feature Specification: Game Service

**Service**: `@specify-poker/game`
**Created**: 2026-01-12
**Status**: Planned

## Overview

The Game Service is the core gameplay engine for the poker application. It manages
table lifecycle, hand execution, action validation, pot calculations, and
moderation state. It enforces Texas Hold'em rules through a deterministic state
machine and coordinates with Balance Service for buy-ins and settlements.

This repository is oriented around **private games among friends** (see `specs/009-private-games-and-product-scope.md`). “Lobby” refers to the table index inside a private instance, not public matchmaking.

## User Scenarios & Testing

### User Story 1 - Table Management (Priority: P1)

As a player, I can create, join, and leave poker tables with appropriate balance
integration for buy-ins and cash-outs.

**Why this priority**: Table management is the foundation for all gameplay;
without tables, no hands can be played.

**Independent Test**: A user creates a table, joins a seat with buy-in reserved
from Balance Service, plays a hand, and leaves with chips returned to balance.

**Acceptance Scenarios**:

1. **Given** a user in the lobby, **When** they create a table with valid config,
   **Then** the table appears in the lobby (instance table index) and they can join it.
2. **Given** a table with open seats, **When** a user joins with sufficient balance,
   **Then** a reservation is created, committed on seat, and stack initialized.
3. **Given** a seated player, **When** they leave the table, **Then** their
   remaining stack is credited to their balance via Balance Service.

---

### User Story 1b - Spectator Access (Priority: P1)

As a spectator, I can watch a table without taking a seat or receiving private
player information.

**Why this priority**: Spectating supports social engagement and table discovery.

**Independent Test**: A user joins as a spectator, receives public table updates,
and cannot act or see hole cards.

**Acceptance Scenarios**:

1. **Given** a user subscribes as a spectator, **When** the table state changes,
   **Then** they receive public table updates.
2. **Given** a spectator, **When** they attempt to submit an action,
   **Then** the action is rejected with "NOT_SEATED" error.
3. **Given** a spectator, **When** hole cards are dealt,
   **Then** they never receive those cards.

---

### User Story 2 - Hand Execution (Priority: P1)

As a player, I can participate in Texas Hold'em hands with proper rule enforcement,
betting rounds, and showdown resolution.

**Why this priority**: Hand execution is the core product value; incorrect rules
would invalidate the entire game.

**Independent Test**: A full hand is played through all streets with multiple
players, actions validated, pots calculated, and winner determined correctly.

**Acceptance Scenarios**:

1. **Given** enough seated players, **When** a hand starts, **Then** blinds are
   posted, cards dealt, and first-to-act determined correctly.
2. **Given** a player's turn, **When** they submit a valid action, **Then** the
   action is applied and game state advances.
3. **Given** a hand reaching showdown, **When** hands are revealed, **Then** the
   winner is determined by proper hand rankings.

---

### User Story 3 - Action Validation (Priority: P1)

As the system, I enforce that only legal actions are accepted and illegal actions
are rejected with appropriate feedback.

**Why this priority**: Action validation ensures game integrity and prevents
cheating or exploits.

**Independent Test**: Various illegal actions (out of turn, insufficient chips,
invalid bet size) are rejected while legal actions succeed.

**Acceptance Scenarios**:

1. **Given** it is not a player's turn, **When** they submit an action, **Then**
   the action is rejected with "NOT_YOUR_TURN" error.
2. **Given** a player with insufficient chips, **When** they bet more than their
   stack, **Then** the action is rejected with "INSUFFICIENT_CHIPS" error.
3. **Given** a raise below minimum, **When** submitted, **Then** it is rejected
   unless it's an all-in.

---

### User Story 4 - Moderation (Priority: P2)

As a table owner, I can kick or mute players at my table to maintain a quality
experience.

**Why this priority**: Moderation is important for user experience but not
required for core gameplay.

**Independent Test**: Table owner kicks a player and they are removed; owner mutes
a player and their chat messages are blocked (via Gateway).

**Acceptance Scenarios**:

1. **Given** a table owner, **When** they kick a seated player, **Then** the
   player is removed from the seat and their stack is returned.
2. **Given** a table owner, **When** they mute a player, **Then** the player
   is added to the mute list and Gateway blocks their chat.
3. **Given** a non-owner player, **When** they attempt to kick/mute, **Then**
   the action is rejected with "NOT_AUTHORIZED" error.

---

### Edge Cases

- Player disconnects mid-hand (auto-fold on turn timeout).
- Player leaves mid-hand (treated as fold; turn advances if needed).
- All players but one fold before showdown.
- Two or more players tie and pot must split.
- Player goes all-in for less than minimum raise.
- Multiple all-ins create complex side pots.
- Hand starts with only two players (heads-up rules).
- Player reconnects and needs state resync.
- Game service restarts mid-hand (turn timer re-armed on next state access).
- Balance Service unavailable during buy-in/cash-out.
- Concurrent join requests for same seat.
- User attempts to join multiple seats at one table (rejected).
- Player attempts action after hand has ended.
- Spectator disconnects and reconnects mid-hand.

## Constitution Requirements

- **Server Authority**: All game state MUST be computed server-side; clients
  cannot influence outcomes.
- **Deterministic Engine**: Given the same inputs, the engine MUST produce
  identical state transitions.
- **Rule Compliance**: Engine MUST implement standard Texas Hold'em rules including
  blinds, betting rounds, minimum raises, side pots, and showdowns.
- **Idempotency**: All mutating gRPC calls (e.g. join/leave, submit action, moderation) MUST be idempotent via client-provided idempotency keys so Gateway retries are safe.
- **Atomic Settlements**: Pot settlements MUST be atomic via Balance Service;
  either all winners credited or none.
- **Audit Trail**: All actions MUST be emitted as events to Event Service.
- **Spectator Isolation**: Spectators MUST NOT receive private hole cards or be
  allowed to submit actions.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow creation of tables with configurable blinds,
  max players (2-9), and starting stack.
- **FR-002**: System MUST list tables with summary info for lobby display.
- **FR-003**: System MUST support joining seats with two-phase buy-in via
  Balance Service.
- **FR-004**: System MUST support leaving seats with cash-out via Balance Service.
- **FR-005**: System MUST automatically start hands when 2+ players are seated
  and ready.
- **FR-006**: System MUST post blinds automatically at hand start.
- **FR-007**: System MUST deal hole cards to players (private, via Gateway).
- **FR-008**: System MUST manage betting rounds (preflop, flop, turn, river).
- **FR-009**: System MUST validate all player actions against game rules.
- **FR-010**: System MUST calculate pots including side pots for all-ins.
- **FR-011**: System MUST determine winners using proper hand evaluation.
- **FR-012**: System MUST settle pots atomically via Balance Service.
- **FR-013**: System MUST enforce turn timers with auto-fold on expiry.
- **FR-014**: System MUST track dealer button and rotate each hand.
- **FR-015**: System MUST support table owner moderation (kick, mute).
- **FR-016**: System MUST expose mute status for Gateway chat filtering.
- **FR-017**: System MUST emit events to Event Service for all state changes.
- **FR-018**: System MUST support graceful degradation when Balance Service
  is unavailable (allow play, reconcile later).
- **FR-019**: System MUST expose gRPC API for Gateway communication.
- **FR-020**: System MUST version table state for client sync.
- **FR-021**: System SHOULD support configurable “house rules” such as optional rake (recommended default for private games: 0).
- **FR-022**: System MUST allow users to join tables as spectators without
  occupying a seat.
- **FR-023**: System MUST ensure spectators only receive public table state
  (no hole cards, no private actions).
- **FR-024**: System MUST ensure a user can occupy at most one seat per table (reject additional joins with `ALREADY_SEATED`).
- **FR-025**: System MUST ensure `hand.turn` always points to a valid `ACTIVE` seat; if it becomes invalid (empty/inactive seat), the server MUST repair/advance the turn and continue timers.
- **FR-026**: System SHOULD re-arm turn timers after a game-service restart for any in-progress hand.

### Non-Functional Requirements

- **NFR-001**: Action processing MUST complete within 50ms.
- **NFR-002**: Hand evaluation MUST complete within 10ms.
- **NFR-003**: System MUST support 100 concurrent tables per instance.
- **NFR-004**: System MUST maintain at least 80% unit test coverage across all core logic.
- **NFR-005**: Unit tests MUST reflect realistic consumer behavior and edge cases.

### Key Entities

- **Table**: Configuration, seats, owner, current status.
- **TableState**: Versioned state including seats, hand, and pot.
- **Seat**: Player occupancy, stack, status, hole cards.
- **Spectator**: Table observer with no seat and no private data access.
- **Hand**: Hand lifecycle, community cards, pot(s), actions.
- **Action**: Player action with type, amount, timestamp.
- **MuteList**: Per-table list of muted user IDs.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of completed hands produce correct winners per hand rankings.
- **SC-002**: 100% of illegal actions are rejected with appropriate error.
- **SC-003**: 99.9% of actions processed within 50ms.
- **SC-004**: 100% of pot calculations are mathematically correct.
- **SC-005**: 0% of hands have missing or duplicate events.

## Assumptions

- Default turn timer is 20 seconds, configurable per table.
- Minimum players to start hand is 2.
- Blinds are small/big; ante support is optional.
- Hand events are emitted to Event Service asynchronously.
- Gateway handles WebSocket delivery; Game Service emits to pub/sub.
- Balance Service integration uses gRPC with fallback.
