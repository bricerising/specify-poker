# Data Model: Game Service

## Entities

### Table

- **Fields**: tableId, name, ownerId, config, status, createdAt
- **Validation**: name required, ownerId required, config valid
- **Relationships**: 1:1 with TableState, 1:1 with MuteList

```typescript
interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  maxPlayers: number;        // 2-9
  startingStack: number;
  turnTimerSeconds: number;  // Default 20
}

type TableStatus = "WAITING" | "PLAYING" | "PAUSED" | "CLOSED";

interface Table {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  status: TableStatus;
  createdAt: string;
}
```

### TableState

- **Fields**: tableId, seats, hand, version, updatedAt
- **Validation**: version >= 0, seats.length <= maxPlayers
- **Notes**: Hot data, cached in Redis, source of truth for gameplay

```typescript
interface TableState {
  tableId: string;
  seats: Seat[];
  spectators: Spectator[];
  hand: HandState | null;    // Null between hands
  button: number;            // Seat index of dealer
  version: number;           // Optimistic locking
  updatedAt: string;
}
```

### Seat

- **Fields**: seatId, userId, stack, status, holeCards
- **Validation**: stack >= 0, seatId 0-8
- **Notes**: holeCards only visible to seat owner

```typescript
type SeatStatus =
  | "EMPTY"
  | "RESERVED"      // Buy-in pending
  | "SEATED"        // Ready to play
  | "SITTING_OUT"   // Temporarily away
  | "DISCONNECTED"; // Connection lost

interface Seat {
  seatId: number;           // 0-8
  userId: string | null;
  stack: number;
  status: SeatStatus;
  holeCards: Card[] | null; // Private, redacted in broadcasts
  reservationId?: string;   // Balance Service reservation
  lastAction?: string;      // ISO timestamp
}

interface Spectator {
  userId: string;
  status: "ACTIVE" | "DISCONNECTED";
  joinedAt: string;
}

interface Card {
  rank: string;   // "2"-"10", "J", "Q", "K", "A"
  suit: string;   // "hearts", "diamonds", "clubs", "spades"
}
```

### HandState

- **Fields**: handId, street, communityCards, pots, currentBet, turn, actions
- **Validation**: street valid, communityCards length matches street
- **Notes**: Created at hand start, cleared at hand end

```typescript
type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";

interface HandState {
  handId: string;
  tableId: string;
  street: Street;
  communityCards: Card[];
  pots: Pot[];
  currentBet: number;        // Current bet to call
  minRaise: number;          // Minimum raise amount
  turn: number;              // Seat index of current actor
  lastAggressor: number;     // Seat index of last raiser
  actions: Action[];
  rakeAmount: number;        // Total rake deducted from pot(s)
  startedAt: string;
  deck: Card[];              // Remaining deck (server only)
}

interface Pot {
  amount: number;
  eligibleSeats: number[];   // Seats eligible to win
}
```

### Action

- **Fields**: actionId, handId, seatId, userId, type, amount, timestamp
- **Validation**: type required, amount >= 0 for bets
- **Notes**: Immutable, emitted to Event Service

```typescript
type ActionType =
  | "POST_BLIND"
  | "FOLD"
  | "CHECK"
  | "CALL"
  | "BET"
  | "RAISE"
  | "ALL_IN";

interface Action {
  actionId: string;
  handId: string;
  seatId: number;
  userId: string;
  type: ActionType;
  amount: number;
  timestamp: string;
}
```

### MuteList

- **Fields**: tableId, mutedUserIds
- **Notes**: Checked by Gateway before delivering chat

```typescript
interface MuteList {
  tableId: string;
  mutedUserIds: string[];
  updatedAt: string;
}
```

### TableSummary

- **Fields**: Derived from Table + TableState for lobby
- **Notes**: Read-only projection for lobby listing

```typescript
interface TableSummary {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seatsTaken: number;
  occupiedSeatIds: number[];
  inProgress: boolean;
  spectatorCount: number;
}
```

## Storage Notes

- **Tables**: Redis hash + PostgreSQL for durability.
- **TableState**: Redis only (hot data), reconstructible from events.
- **Seats**: Part of TableState, not stored separately.
- **MuteLists**: Redis hash per table.
- **Hand events**: Emitted to Event Service, not stored locally.

## Redis Key Namespace

```
game:tables:{tableId}                    # Table JSON
game:tables:ids                          # Set of all table IDs
game:tables:by-owner:{ownerId}           # Set of table IDs

game:state:{tableId}                     # TableState JSON
game:state:lock:{tableId}                # Distributed lock for updates

game:mutes:{tableId}                     # Set of muted user IDs

game:hands:{tableId}                     # Current HandState JSON (if active)
game:hands:deck:{tableId}                # Shuffled deck (server only)

game:lobby                               # Cached TableSummary list
game:lobby:version                       # Version for cache invalidation
```

## gRPC Service Definition

```protobuf
service GameService {
  // Table management
  rpc CreateTable(CreateTableRequest) returns (Table);
  rpc GetTable(GetTableRequest) returns (Table);
  rpc ListTables(ListTablesRequest) returns (ListTablesResponse);
  rpc DeleteTable(DeleteTableRequest) returns (Empty);

  // Seat management
  rpc JoinSeat(JoinSeatRequest) returns (JoinSeatResponse);
  rpc LeaveSeat(LeaveSeatRequest) returns (LeaveSeatResponse);
  rpc GetTableState(GetTableStateRequest) returns (TableState);

  // Actions
  rpc SubmitAction(SubmitActionRequest) returns (SubmitActionResponse);

  // Moderation
  rpc KickPlayer(KickPlayerRequest) returns (Empty);
  rpc MutePlayer(MutePlayerRequest) returns (Empty);
  rpc UnmutePlayer(UnmutePlayerRequest) returns (Empty);
  rpc IsMuted(IsMutedRequest) returns (IsMutedResponse);
}
```

## State Transitions

### Table Status

```
WAITING -> PLAYING (hand starts)
PLAYING -> WAITING (hand ends, <2 players)
PLAYING -> PLAYING (hand ends, >=2 players, next hand)
* -> PAUSED (manual pause)
* -> CLOSED (table deleted)
```

### Seat Status

```
EMPTY -> RESERVED (join initiated)
RESERVED -> SEATED (buy-in committed)
RESERVED -> EMPTY (buy-in failed/timeout)
SEATED -> SITTING_OUT (player sits out)
SITTING_OUT -> SEATED (player returns)
SEATED -> DISCONNECTED (connection lost)
DISCONNECTED -> SEATED (reconnect)
* -> EMPTY (leave table)
```

### Hand Street

```
(none) -> PREFLOP (hand starts)
PREFLOP -> FLOP (betting complete)
FLOP -> TURN (betting complete)
TURN -> RIVER (betting complete)
RIVER -> SHOWDOWN (betting complete)
SHOWDOWN -> (none) (pot settled)
```

## Relationships

- **Table** 1:1 **TableState**
- **Table** 1:1 **MuteList**
- **TableState** 1:N **Seat**
- **TableState** 0:1 **HandState** (active hand)
- **HandState** 1:N **Action**

## Consistency Guarantees

- **Table state**: Optimistic locking via version field.
- **Actions**: Validated and applied atomically within lock.
- **Pot settlements**: Two-phase with Balance Service.
- **Events**: At-least-once delivery to Event Service.

## Engine Module

The game engine is a pure functional module with no I/O:

```typescript
// Pure functions for game logic
module Engine {
  function validateAction(state: TableState, action: ActionInput): ValidationResult;
  function applyAction(state: TableState, action: Action): TableState;
  function advanceStreet(state: TableState): TableState;
  function calculatePots(contributions: Map<number, number>): Pot[];
  function evaluateHand(cards: Card[]): HandRank;
  function determineWinners(hands: Map<number, Card[]>, community: Card[]): number[];
  function dealCards(deck: Card[], count: number): [Card[], Card[]];
  function shuffleDeck(seed?: number): Card[];
}
```
