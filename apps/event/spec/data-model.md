# Data Model: Event Service

## Entities

### GameEvent

- **Fields**: eventId, type, tableId, handId, payload, userId, timestamp, sequence
- **Validation**: type required, tableId required, sequence unique per hand
- **Notes**: Immutable, append-only storage

```typescript
type EventType =
  | "HAND_STARTED"
  | "CARDS_DEALT"
  | "BLIND_POSTED"
  | "ACTION_TAKEN"
  | "STREET_ADVANCED"
  | "CARDS_REVEALED"
  | "SHOWDOWN"
  | "POT_AWARDED"
  | "HAND_COMPLETED"
  | "PLAYER_JOINED"
  | "PLAYER_LEFT"
  | "PLAYER_SAT_OUT"
  | "PLAYER_SAT_IN"
  | "TABLE_CREATED"
  | "TABLE_CLOSED"
  | "TURN_STARTED"
  | "RAKE_DEDUCTED"      // Optional house rule (not required for private games)
  | "BONUS_ISSUED"       // Optional chip faucet (not required for private games)
  | "REFERRAL_ISSUED";   // Optional growth mechanic (not required for private games)

interface GameEvent {
  eventId: string;          // UUID
  type: EventType;
  tableId: string;
  handId: string | null;    // Null for table-level events
  userId: string | null;    // Actor, if applicable
  seatId: number | null;    // Seat position, if applicable
  payload: EventPayload;    // Type-specific data
  timestamp: string;        // ISO timestamp
  sequence: number;         // Order within hand (1-based)
}
```

### Event Payloads

```typescript
interface HandStartedPayload {
  button: number;
  seats: { seatId: number; userId: string; stack: number }[];
  smallBlind: number;
  bigBlind: number;
}

interface CardsDealtPayload {
  seatId: number;
  cards: Card[];            // Stored for participants; fully redacted for non-participants
}

interface BlindPostedPayload {
  seatId: number;
  amount: number;
  blindType: "SMALL" | "BIG" | "ANTE";
}

interface ActionTakenPayload {
  seatId: number;
  action: ActionType;
  amount: number;
  isAllIn: boolean;
}

interface StreetAdvancedPayload {
  street: Street;
  communityCards: Card[];
}

interface ShowdownPayload {
  reveals: { seatId: number; cards: Card[]; handRank: string }[];
}

interface PotAwardedPayload {
  potIndex: number;
  amount: number;
  winners: { seatId: number; share: number }[];
}

interface HandCompletedPayload {
  duration: number;         // Milliseconds
  totalPot: number;
  rake: number;
}

type EventPayload =
  | HandStartedPayload
  | CardsDealtPayload
  | BlindPostedPayload
  | ActionTakenPayload
  | StreetAdvancedPayload
  | ShowdownPayload
  | PotAwardedPayload
  | HandCompletedPayload
  | Record<string, unknown>;
```

### HandRecord

- **Fields**: handId, tableId, startedAt, completedAt, summary, events
- **Validation**: completedAt > startedAt, events non-empty
- **Notes**: Materialized view of events for efficient hand history queries

```typescript
interface HandRecord {
  handId: string;
  tableId: string;
  tableName: string;
  config: {
    smallBlind: number;
    bigBlind: number;
    ante: number;
  };
  participants: HandParticipant[];
  communityCards: Card[];
  pots: { amount: number; winners: string[] }[];
  winners: { userId: string; amount: number }[];
  startedAt: string;
  completedAt: string;
  duration: number;
}

interface HandParticipant {
  seatId: number;
  userId: string;
  nickname: string;
  startingStack: number;
  endingStack: number;
  holeCards: Card[] | null;  // Visible to participant; opponents only if revealed at showdown; non-participants always null
  actions: ParticipantAction[];
  result: "WON" | "LOST" | "FOLDED" | "SPLIT";
}

interface ParticipantAction {
  street: Street;
  action: ActionType;
  amount: number;
  timestamp: string;
}
```

### EventStream

- **Fields**: streamId, context, latestSequence, subscribers
- **Notes**: Logical grouping for pub/sub

```typescript
interface EventStream {
  streamId: string;         // e.g., "table:{tableId}" or "hand:{handId}"
  context: "TABLE" | "HAND" | "USER";
  contextId: string;
  latestSequence: number;
  createdAt: string;
}
```

### Cursor

- **Fields**: cursorId, streamId, subscriberId, position, createdAt
- **Notes**: Enables resumable consumption

```typescript
interface Cursor {
  cursorId: string;
  streamId: string;
  subscriberId: string;     // Service or connection ID
  position: number;         // Last consumed sequence
  createdAt: string;
  updatedAt: string;
}
```

### EventQuery

- **Fields**: Filter and pagination parameters
- **Notes**: Used for audit queries

```typescript
interface EventQuery {
  tableId?: string;
  handId?: string;
  userId?: string;
  types?: EventType[];
  startTime?: string;
  endTime?: string;
  limit: number;
  offset?: number;
  cursor?: string;
}

interface EventQueryResult {
  events: GameEvent[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}
```

## Storage Notes

- **Events**: PostgreSQL with partitioning by month for efficient retention.
- **HandRecords**: PostgreSQL, materialized after hand completion.
- **Active streams**: Redis for real-time pub/sub.
- **Cursors**: Redis with PostgreSQL backup for durability.
- **Archive**: Cold storage (S3/GCS) for events older than 90 days.

## PostgreSQL Schema

```sql
-- Events table with time-based partitioning
CREATE TABLE events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  table_id VARCHAR(255) NOT NULL,
  hand_id VARCHAR(255),
  user_id VARCHAR(255),
  seat_id SMALLINT,
  payload JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sequence INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_events_table ON events(table_id, timestamp);
CREATE INDEX idx_events_hand ON events(hand_id, sequence) WHERE hand_id IS NOT NULL;
CREATE INDEX idx_events_user ON events(user_id, timestamp) WHERE user_id IS NOT NULL;
CREATE INDEX idx_events_type ON events(type, timestamp);

-- Hand records for efficient history queries
CREATE TABLE hand_records (
  hand_id VARCHAR(255) PRIMARY KEY,
  table_id VARCHAR(255) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  config JSONB NOT NULL,
  participants JSONB NOT NULL,
  community_cards JSONB NOT NULL,
  pots JSONB NOT NULL,
  winners JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hand_records_table ON hand_records(table_id, completed_at DESC);
CREATE INDEX idx_hand_records_participants ON hand_records
  USING GIN ((participants));

-- Cursors for stream consumption
CREATE TABLE cursors (
  cursor_id VARCHAR(255) PRIMARY KEY,
  stream_id VARCHAR(255) NOT NULL,
  subscriber_id VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stream_id, subscriber_id)
);

CREATE INDEX idx_cursors_stream ON cursors(stream_id);
```

## Redis Key Namespace

```
event:streams:{streamId}              # Stream metadata
event:streams:{streamId}:events       # Redis Stream for real-time delivery
event:streams:{streamId}:subscribers  # Set of subscriber IDs

event:cursors:{cursorId}              # Cursor position (fast lookup)
event:cursors:by-subscriber:{subId}   # Set of cursor IDs for subscriber

event:hands:active:{tableId}          # Current hand events (before flush to PG)
event:hands:sequence:{handId}         # Sequence counter for hand
```

## gRPC Service Definition

```protobuf
service EventService {
  // Event ingestion
  rpc PublishEvent(PublishEventRequest) returns (PublishEventResponse);
  rpc PublishEvents(PublishEventsRequest) returns (PublishEventsResponse);

  // Event queries
  rpc QueryEvents(QueryEventsRequest) returns (QueryEventsResponse);
  rpc GetEvent(GetEventRequest) returns (GameEvent);

  // Hand history
  rpc GetHandRecord(GetHandRecordRequest) returns (HandRecord);
  rpc GetHandHistory(GetHandHistoryRequest) returns (GetHandHistoryResponse);
  rpc GetHandsForUser(GetHandsForUserRequest) returns (GetHandsForUserResponse);

  // Hand replay
  rpc GetHandReplay(GetHandReplayRequest) returns (GetHandReplayResponse);

  // Streaming
  rpc SubscribeToStream(SubscribeRequest) returns (stream GameEvent);
  rpc GetCursor(GetCursorRequest) returns (Cursor);
  rpc UpdateCursor(UpdateCursorRequest) returns (Cursor);
}
```

## Relationships

- **GameEvent** N:1 **HandRecord** (events belong to hand)
- **GameEvent** N:1 **EventStream** (events flow through streams)
- **Cursor** N:1 **EventStream** (cursors track stream position)
- **HandRecord** N:1 **Table** (hands belong to table)
- **HandParticipant** N:1 **Profile** (via userId, from Player Service)

## State Transitions

### Event Lifecycle

```
RECEIVED -> VALIDATED -> STORED -> PUBLISHED -> ACKNOWLEDGED
```

### Hand Record Lifecycle

```
(none) -> ACCUMULATING (events arriving)
ACCUMULATING -> MATERIALIZING (hand completed, aggregating)
MATERIALIZING -> COMPLETE (record stored)
COMPLETE -> ARCHIVED (moved to cold storage)
```

## Consistency Guarantees

- **Events**: At-least-once delivery, exactly-once storage (via idempotency key).
- **Ordering**: Strict ordering within hand via sequence numbers.
- **Streams**: Best-effort delivery, cursor enables catch-up.
- **Hand records**: Eventual consistency (materialized after completion).

## Privacy & Access Control

### Data Access Rules

1. **Players**: Can access hand history for hands they participated in.
2. **Instance Admins**: Can query events for debugging and support in a private deployment.
3. **Analytics**: Access to anonymized/aggregated data only.

### Hole Card Visibility

- **During hand**: Only visible to card holder.
- **After showdown**: Visible to all participants if shown.
- **In history**: Visible based on above rules.
- **For instance admins**: Visible only when explicitly requested for debugging.

### Retention Policy

| Data Type | Hot (Redis) | Warm (PostgreSQL) | Cold (Archive) |
|-----------|-------------|-------------------|----------------|
| Events | 24 hours | 90 days | Optional export |
| Hand Records | 7 days | 90 days | Optional export |
| Cursors | 7 days | 30 days | N/A |

## Event Flow

```
Game Service                    Event Service                    Subscribers
     |                               |                                |
     | PublishEvent                  |                                |
     |------------------------------>|                                |
     |                               | Validate & Store               |
     |                               |--------------->                |
     |                               |               PostgreSQL       |
     |                               |                                |
     |                               | Publish to Stream              |
     |                               |--------------->                |
     |                               |               Redis Stream     |
     |                               |                                |
     |                               | Fan-out to Subscribers         |
     |                               |------------------------------->|
     |                               |                                |
     | PublishEventResponse          |                                |
     |<------------------------------|                                |
```
