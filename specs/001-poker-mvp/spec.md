# Feature Specification: Play-Money Poker MVP

**Feature Branch**: `001-poker-mvp`  
**Created**: 2026-01-09  
**Status**: Implemented  
**Input**: User description: "Build a web-based poker website (MVP) for play-money
Texas Hold’em. Users: - Users can create a nickname and avatar. - Authenticate
users using keycloak. - Support logging in with google accounts. - Basic
profiles: nickname, avatar, stats (hands played, wins), and a friends list
(optional). Player flows: 1) Landing page → “Enter Lobby” 2) Lobby shows tables
with: table name, blinds, max players, seats taken, and whether a hand is in
progress. 3) Create table: set table name, blinds (small/big), max players (2–9),
and starting chip stack (play money). 4) Join table: choose a seat if open. If a
hand is in progress, join as spectator until next hand. In-table experience: -
Table layout: seats around the table, community cards, pot, dealer button, player
action controls. - Player actions: fold, check/call, bet/raise with a chip slider
and presets (½ pot, pot, all-in). - Timers: each player has X seconds to act; if
timer expires, auto-fold (or check when legal). - Chat: simple text chat per
table. Game rules: - Correct Texas Hold’em rules: blinds, dealing, betting
rounds, hand evaluation, side pots, showdown, split pots. - Minimum raises equal
the size of the previous bet or raise; all-in raises below the minimum are
allowed but do not reopen betting. - Deterministic state machine: the same
inputs always produce the same game state. - Handle disconnects: if a player
disconnects during a hand, auto-fold when action is required; allow reconnect.
Non-functional: - Real-time updates (table state should feel instant). - Prevent
obvious cheating: server-authoritative game state, no client deciding outcomes.
- Auditability: keep an event log per hand (actions + timestamps) for debugging.
- Rate limit HTTP and WebSocket actions to mitigate abuse.
- Basic moderation controls for table owner: kick a player, mute chat. Out of
scope (explicitly): - Real money, payments, cashout - Multi-table tournaments -
Complex auth (email/password), compliance features"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Join & Play a Hand (Priority: P1)

As a player, I can enter the lobby, join a table, receive real-time updates, and
play a complete hand of Texas Hold’em with legal actions only.

**Why this priority**: Core gameplay is the MVP value; without it the product
does not deliver.

**Independent Test**: A single player can join a table with bots or test users,
play a full hand through showdown, and see the correct winner and chip updates.

**Acceptance Scenarios**:

1. **Given** an authenticated user in the lobby, **When** they join an open seat,
   **Then** the table view loads and shows their seat, stack, and action controls.
2. **Given** an active hand, **When** it is the user's turn to act, **Then** only
   legal actions are presented and the action updates the table state for all
   players in real time.

---

### User Story 2 - Create & Manage a Table (Priority: P2)

As a player, I can create a new table with play-money settings and manage basic
moderation controls for my table.

**Why this priority**: Table creation is required to start new games and manage
the session quality.

**Independent Test**: A user creates a table, joins a seat, and can remove or
mute another test user without affecting other tables.

**Acceptance Scenarios**:

1. **Given** an authenticated user in the lobby, **When** they create a table,
   **Then** the table appears in the lobby list with its settings and occupancy.
2. **Given** the table owner is seated, **When** they kick or mute a player,
   **Then** the affected player is removed or muted for that table only.

---

### User Story 3 - Profiles & Social Context (Priority: P3)

As a player, I can set a nickname and avatar and view basic profile stats in the
table and lobby.

**Why this priority**: Identity and stats improve the social experience but are
not required to complete a hand.

**Independent Test**: A user updates nickname/avatar and sees them reflected in
the lobby and table without impacting gameplay.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they update their nickname or
   avatar, **Then** the updated profile appears in the lobby and table.

---

### Edge Cases

- Player disconnects while it is their turn to act.
- Player reconnects after missing updates and must resync state.
- All players but one fold before showdown.
- Two or more players tie and the pot must be split.
- A player attempts an illegal action (out of turn, insufficient chips).
- A spectator joins mid-hand and must not see private hole cards.
- Table owner disconnects while moderation controls are needed.
- A player goes all-in for less than the minimum raise amount.

## Constitution Requirements *(mandatory)*

- **Secure multi-device access**: Only authenticated users can access the lobby
  and tables; sessions can be revoked per user.
- **Realtime sync + push**: Live table updates are delivered instantly; players
  receive out-of-band turn notifications to stay in sync across devices.
- **Telemetry**: Core events are captured for logins, table creation/join,
  actions, hand outcomes, and disconnects under a defined schema.
- **Deterministic rules**: Game progression follows a deterministic state
  machine with replayable event logs.
- **No platform payments**: The MVP uses play-money only and includes no payment
  or cashout flows.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users via Keycloak and allow Google login.
- **FR-002**: System MUST allow users to set a nickname and avatar.
- **FR-003**: System MUST show a lobby listing available tables with name, blinds,
  max players, seats taken, occupied seat ids, owner id, and in-progress status.
- **FR-004**: System MUST allow users to create a table with name, blinds,
  optional ante, max players (2–9), and starting chip stack.
- **FR-005**: System MUST allow users to join an open seat or spectate if a hand
  is in progress.
- **FR-006**: System MUST present only legal actions (fold, check/call, bet/raise)
  for the current player.
- **FR-007**: System MUST enforce Texas Hold’em rules, including blinds, betting
  rounds, minimum raise rules, side pots, and showdown outcomes.
- **FR-008**: System MUST be server-authoritative so the client cannot decide
  outcomes or alter game state.
- **FR-009**: System MUST update table state for all players in real time.
- **FR-010**: System MUST apply a turn timer and auto-fold or auto-check on expiry.
- **FR-011**: System MUST store a per-hand event log with timestamps for audit,
  and expose a redacted replay endpoint for debugging.
- **FR-012**: System MUST support per-table chat with basic moderation (kick, mute),
  and restrict chat participation to seated players.
- **FR-013**: System MUST track basic user stats (hands played, wins) and display
  them in profile views; a win is counted when a player wins any portion of a pot.
- **FR-014**: System MUST protect private hole cards from non-owning players and
  spectators by redacting snapshots and sending hole cards only to the owning seat.
- **FR-015**: System MUST allow players to reconnect and resync their current
  table state.
- **FR-016**: System MUST provide a friends list capability that can be empty or
  unused without impacting gameplay.
- **FR-017**: System MUST provide turn notifications to keep multi-device users
  in sync when they are not actively viewing the table.
- **FR-018**: System MUST version table state updates and allow clients to resync
  when out-of-order updates are detected; table patches deliver full state payloads.
- **FR-019**: System MUST expose a Prometheus-compatible metrics endpoint and emit
  OpenTelemetry traces for core gameplay events.

### Key Entities *(include if feature involves data)*

- **UserProfile**: User identity, nickname, avatar, stats, and friends list.
- **Table**: Table configuration, seats, owner, and current status.
- **TableSummary**: Lobby view of table status and occupied seats.
- **TableState**: Versioned table state for gameplay sync.
- **Seat**: Player occupancy, stack, and status at a table.
- **Hand**: Hand lifecycle, community cards, pot(s), and outcome.
- **HandEvent**: Timestamped game actions for audit and replay.
- **ChatMessage**: Per-table message with author and timestamp.
- **PushSubscription**: Web push subscription endpoint and keys.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of users can join a table and begin a hand within 2 minutes of
  entering the lobby.
- **SC-002**: Table state updates are observed by all seated players within
  1 second for 95% of actions.
- **SC-003**: 99% of completed hands produce consistent outcomes across clients
  when replayed from the event log.
- **SC-004**: At least 90% of test users can complete a full hand without
  encountering illegal action prompts.
- **SC-005**: Chat and moderation actions complete successfully in 95% of trials.

## Assumptions

- Default turn timer is 20 seconds and can be overridden via configuration.
- Friends list is stored and displayed but does not include invitations or
  presence indicators in the MVP.
- Ante configuration is accepted by the API but the UI does not expose it.
- If no tables exist, a default "Main Table" is created for the lobby.
