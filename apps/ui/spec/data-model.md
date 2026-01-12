# Data Model: UI Application

## Client-Side State

### TableStoreState

Main application state container for table-related data.

```typescript
interface TableStoreState {
  tables: TableSummary[];           // Lobby table list
  tableState: TableState | null;    // Current table state (if viewing/playing)
  seatId: number | null;            // User's seat index (if seated)
  status: "idle" | "connecting" | "connected" | "error";
  error?: string;                   // Connection error message
  chatMessages: ChatMessage[];      // Table chat history
  chatError?: string;               // Chat error (e.g., muted)
  privateHoleCards: string[] | null; // User's hole cards
  privateHandId: string | null;     // Hand ID for current hole cards
}
```

### TableSummary

Lobby representation of a table for listing.

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

### TableConfig

Table configuration settings.

```typescript
interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number | null;
  maxPlayers: number;           // 2-9
  startingStack: number;
  bettingStructure: "NoLimit";
  turnTimerSeconds?: number;    // Default 20
}
```

### TableState

Full table state for gameplay display.

```typescript
interface TableState {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seats: TableSeat[];
  spectators: SpectatorView[];
  status: "lobby" | "in_hand";
  hand: HandState | null;
  version: number;              // For sync tracking
}
```

### TableSeat

Individual seat in a table.

```typescript
interface TableSeat {
  seatId: number;               // 0-8
  userId: string | null;
  nickname?: string;
  stack: number;
  status: SeatStatus;
}

type SeatStatus =
  | "empty"
  | "active"
  | "folded"
  | "all_in"
  | "sitting_out"
  | "disconnected";
```

### SpectatorView

Spectator information for display.

```typescript
interface SpectatorView {
  userId: string;
  nickname?: string;
  status: "active" | "disconnected";
}
```

### HandState

Current hand state during gameplay.

```typescript
interface HandState {
  handId: string;
  tableId: string;
  currentStreet: Street;
  currentTurnSeat: number;
  currentBet: number;
  minRaise: number;
  raiseCapped: boolean;
  roundContributions: Record<number, number>;  // seatId -> chips contributed this round
  totalContributions: Record<number, number>;  // seatId -> total chips contributed
  actedSeats: number[];
  communityCards: string[];     // e.g., ["Ah", "Kd", "Qs"]
  pots: Pot[];
  actionTimerDeadline: string | null;  // ISO timestamp
  bigBlind: number;
  winners?: number[];           // Seat IDs of winners (after showdown)
  startedAt: string;
  endedAt?: string | null;
}

type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "ended";
```

### Pot

Pot information for display.

```typescript
interface Pot {
  amount: number;
  eligibleSeatIds: number[];
}
```

### ChatMessage

Chat message for display.

```typescript
interface ChatMessage {
  id: string;
  userId: string;
  nickname?: string;
  text: string;
  ts: string;                   // ISO timestamp
}
```

### UserProfile

User profile information.

```typescript
interface UserProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  stats: UserStats;
  friends: string[];            // Array of friend user IDs
}

interface UserStats {
  handsPlayed: number;
  wins: number;
}
```

### LegalActions

Computed legal actions for current player.

```typescript
interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;             // All-in amount
  canAllIn: boolean;
}
```

## Card Notation

Cards are represented as 2-character strings:
- **Rank**: 2-9, T (ten), J, Q, K, A
- **Suit**: h (hearts), d (diamonds), c (clubs), s (spades)

Examples:
- `"Ah"` - Ace of hearts
- `"Ks"` - King of spades
- `"Td"` - Ten of diamonds
- `"2c"` - Two of clubs

## WebSocket Message Types

### Client -> Gateway

```typescript
type ClientMessage =
  | { type: "SubscribeTable"; tableId: string }
  | { type: "UnsubscribeTable"; tableId: string }
  | { type: "ResyncTable"; tableId: string }
  | { type: "JoinSeat"; tableId: string; seatId: number }
  | { type: "LeaveTable"; tableId: string }
  | { type: "Action"; tableId: string; handId: string; action: string; amount?: number }
  | { type: "SubscribeChat"; tableId: string }
  | { type: "UnsubscribeChat"; tableId: string }
  | { type: "ChatSend"; tableId: string; message: string };
```

### Gateway -> Client

```typescript
type ServerMessage =
  | { type: "Welcome"; userId: string; connectionId: string }
  | { type: "Error"; code: string; message: string; correlationId?: string }
  | { type: "LobbyTablesUpdated"; tables: TableSummary[] }
  | { type: "TableSnapshot"; tableState: TableState }
  | { type: "TablePatch"; tableId: string; handId: string; patch: Partial<TableState> }
  | { type: "HoleCards"; tableId: string; handId: string; seatId: number; cards: [string, string] }
  | { type: "ActionResult"; tableId: string; handId: string; accepted: boolean; reason?: string }
  | { type: "ChatSubscribed"; tableId: string }
  | { type: "ChatError"; tableId: string; reason: string }
  | { type: "ChatMessage"; tableId: string; message: ChatMessage }
  | { type: "TimerUpdate"; tableId: string; handId: string; currentTurnSeat: number; deadlineTs: string }
  | { type: "HandEvent"; tableId: string; handId: string; event: GameEvent }
  | { type: "SpectatorJoined"; tableId: string; userId: string; nickname?: string; spectatorCount: number }
  | { type: "SpectatorLeft"; tableId: string; userId: string; spectatorCount: number };
```

## Local Storage

The UI uses memory storage for sensitive data but may use localStorage for:

```typescript
interface LocalStorageSchema {
  "poker:preferences"?: {
    soundEnabled: boolean;
    chatEnabled: boolean;
    theme: "light" | "dark" | "auto";
  };
  "poker:lastTable"?: string;   // tableId for quick rejoin
}
```

**Note**: Authentication tokens are stored in memory only, never in localStorage.

## Authentication State

```typescript
interface AuthState {
  status: "checking" | "authed" | "anon";
  accessToken?: string;         // In memory only
  tokenExpiry?: number;         // Unix timestamp
  userId?: string;              // From JWT sub claim
}
```

## API Response Types

### HTTP Endpoints

```typescript
// GET /api/tables
type TablesResponse = TableSummary[];

// POST /api/tables
interface CreateTableRequest {
  name: string;
  config: Partial<TableConfig>;
}
type CreateTableResponse = TableSummary;

// POST /api/tables/{tableId}/join
interface JoinSeatRequest {
  seatId: number;
}
interface JoinSeatResponse {
  tableId: string;
  seatId: number;
  wsUrl: string;
}

// GET /api/me
type ProfileResponse = UserProfile;

// POST /api/profile
interface UpdateProfileRequest {
  nickname?: string;
  avatarUrl?: string | null;
}
type UpdateProfileResponse = UserProfile;

// GET /api/friends
interface FriendsResponse {
  friends: string[];
}

// PUT /api/friends
interface UpdateFriendsRequest {
  friends: string[];
}
type UpdateFriendsResponse = FriendsResponse;

// GET /api/push/vapid
interface VapidResponse {
  publicKey: string;
}

// POST /api/push/subscribe
interface PushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
```

## State Synchronization

### Version Tracking

The UI tracks state versions to handle out-of-order WebSocket messages:

```typescript
function isStaleVersion(current: number | null, incoming: number): boolean {
  return current !== null && incoming <= current;
}

function shouldResync(current: number | null, incoming: number): boolean {
  return current !== null && incoming > current + 1;
}
```

### Resync Flow

1. Receive message with version gap (current + 1 < incoming)
2. Send `ResyncTable` message to gateway
3. Gateway responds with `TableSnapshot`
4. Replace entire table state

### Private Data Handling

Private hole cards are:
- Delivered separately via `HoleCards` message
- Never included in shared `TableState`
- Cleared when hand ID changes
- Stored in separate state fields (`privateHoleCards`, `privateHandId`)

## Component Props

### TablePage

```typescript
interface TablePageProps {
  store: TableStore;
}
```

### LobbyPage

```typescript
interface LobbyPageProps {
  store: TableStore;
}
```

### ActionBar

```typescript
interface ActionBarProps {
  hand: HandState;
  seatId: number;
  stack: number;
  onAction: (action: { type: string; amount?: number }) => void;
}
```

### ChatPanel

```typescript
interface ChatPanelProps {
  messages: ChatMessage[];
  error?: string;
  onSend: (message: string) => void;
}
```

### ProfilePage

```typescript
interface ProfilePageProps {
  onProfileUpdated: (profile: UserProfile) => void;
}
```
