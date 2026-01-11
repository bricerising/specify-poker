# Data Model: Play-Money Poker MVP

## Entities

### UserProfile
- **Fields**: userId, nickname, avatarUrl, stats.handsPlayed, stats.wins,
  friends[]
- **Validation**: nickname length 2-20, avatarUrl optional, friends unique
- **Relationships**: 1:N with TableSummary as owner, 1:N with Seat

### TableSummary (Lobby List)
- **Fields**: tableId, name, ownerId, config, seatsTaken, occupiedSeatIds[],
  inProgress
- **Validation**: name required, maxPlayers 2-9

### TableState
- **Fields**: tableId, name, ownerId, config, seats[], status (lobby|in_hand),
  hand, version
- **Notes**: version increments with each update for resync handling

### TableSeatView (Client)
- **Fields**: seatId, userId, stack, status, nickname?
- **Notes**: nickname is resolved from the user profile when available

### TableStateView (Client)
- **Fields**: Same as TableState but seats[] are TableSeatView
- **Notes**: WebSocket snapshots/patches send TableStateView with redacted hand data

### TableConfig
- **Fields**: smallBlind, bigBlind, ante(optional), maxPlayers, startingStack,
  bettingStructure (NoLimit)
- **Validation**: bigBlind >= 2 * smallBlind, ante < smallBlind, startingStack > 0

### Seat
- **Fields**: seatId, userId(optional for empty), stack, status
  (empty|active|folded|all_in|disconnected|spectator)
- **Validation**: seatId 0-8, stack >= 0
- **Relationships**: N:1 with TableState, N:1 with UserProfile

### Hand
- **Fields**: handId, tableId, buttonSeat, smallBlindSeat, bigBlindSeat,
  communityCards[], pots[], currentStreet, currentTurnSeat, currentBet,
  minRaise, raiseCapped, roundContributions, totalContributions, actedSeats[],
  actionTimerDeadline, startedAt, endedAt, deck[], holeCards{}, winners[]
- **Validation**: communityCards length 0-5, currentStreet in
  preflop|flop|turn|river|showdown|ended
- **Notes**: deck and holeCards are stored server-side and redacted in snapshots;
  hole cards are delivered separately to the owning seat

### HandEvent
- **Fields**: eventId, handId, type, payload, ts
- **Validation**: type in HandStarted|ActionTaken|Showdown|HandEnded
- **Notes**: audit responses redact holeCards and deck in snapshot payloads

### ChatMessage
- **Fields**: id, tableId, userId, nickname, text, ts
- **Validation**: message length <= 500, sanitized content
- **Notes**: chat is ephemeral and broadcast over WebSocket (not persisted)

### PushSubscription
- **Fields**: endpoint, keys.p256dh, keys.auth
- **Relationships**: N:1 with UserProfile

### ModerationMute
- **Fields**: tableId, userId
- **Notes**: stored per table to block chat sends

## Storage Notes

- **Profiles, friends, moderation mutes, push subscriptions, tables, table states, hand events**:
  cached in memory and persisted to Redis when available.
- **Lobby tables**: stored as a Redis hash keyed by `poker:tables`.
- **Table state**: stored as JSON blobs keyed by `poker:tableState:{tableId}` with a set of ids.
- **Hand events**: stored as Redis lists per hand id (and mirrored in memory).

## Relationships

- **UserProfile** 1:N **Seat**
- **UserProfile** 1:N **TableSummary** (owner)
- **TableState** 1:N **Seat**
- **TableState** 1:N **Hand**
- **Hand** 1:N **HandEvent**

## State Transitions

### Hand Lifecycle
- lobby -> in_hand on HandStarted
- preflop -> flop -> turn -> river -> showdown -> ended
- ended -> lobby when hand is complete and next hand setup begins

### Seat Status
- empty -> active on join seat
- active -> folded on Fold
- active -> all_in on Bet/Call raising to stack
- active -> disconnected on socket close
- disconnected -> active on reconnect
- spectator -> active on next hand start
