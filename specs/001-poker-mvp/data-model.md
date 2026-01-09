# Data Model: Play-Money Poker MVP

## Entities

### UserProfile
- **Fields**: userId, nickname, avatarUrl, stats.handsPlayed, stats.wins,
  friends[]
- **Validation**: nickname length 2-20, avatarUrl optional, friends unique
- **Relationships**: 1:N with Table as owner, 1:N with Seat

### Table
- **Fields**: tableId, name, ownerId, config, status (lobby|in_hand),
  createdAt
- **Validation**: name required, maxPlayers 2-9
- **Relationships**: 1:N with Seat, 1:N with Hand, 1:N with ChatMessage

### TableConfig
- **Fields**: smallBlind, bigBlind, ante(optional), maxPlayers, startingStack,
  bettingStructure
- **Validation**: bigBlind >= 2 * smallBlind, ante < smallBlind, startingStack > 0

### Seat
- **Fields**: seatId, userId(optional for empty), stack, status
  (active|folded|all_in|disconnected|spectator)
- **Validation**: seatId 0-8, stack >= 0
- **Relationships**: N:1 with Table, N:1 with UserProfile

### Hand
- **Fields**: handId, tableId, buttonSeat, smallBlindSeat, bigBlindSeat,
  communityCards[], pot(s), currentStreet, currentTurnSeat, currentBet,
  minRaise, roundContributions, actionTimerDeadline, startedAt, endedAt
- **Validation**: communityCards length 0-5, currentStreet in
  preflop|flop|turn|river|showdown|ended
- **Relationships**: 1:N with HandEvent

### HandEvent
- **Fields**: eventId, handId, type, payload, ts
- **Validation**: type in HandStarted|BlindsPosted|CardsDealt|ActionTaken|
  StreetDealt|PotUpdated|Showdown|HandEnded

### ChatMessage
- **Fields**: messageId, tableId, userId, message, ts, isMuted
- **Validation**: message length <= 500, sanitized content

## Relationships

- **UserProfile** 1:N **Seat**
- **UserProfile** 1:N **Table** (owner)
- **Table** 1:N **Seat**
- **Table** 1:N **Hand**
- **Hand** 1:N **HandEvent**
- **Table** 1:N **ChatMessage**

## State Transitions

### Hand Lifecycle
- lobby -> in_hand on HandStarted
- preflop -> flop -> turn -> river -> showdown -> ended
- ended -> lobby when hand is complete and next hand setup begins

### Seat Status
- empty -> active on join seat
- active -> folded on Fold
- active -> all_in on Bet/Call raising to stack
- active -> disconnected on disconnect event
- disconnected -> active on reconnect
