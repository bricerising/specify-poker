# Data Model: Gateway Service

## Entities

### Connection

- **Fields**: connectionId, userId, connectedAt, lastActivity, subscriptions, instanceId
- **Validation**: userId required, connectionId unique
- **Relationships**: 1:N with Subscription
- **Notes**: Ephemeral, stored in Redis with TTL

```typescript
interface Connection {
  connectionId: string;     // UUID assigned on connect
  userId: string;           // From JWT sub claim
  connectedAt: string;      // ISO timestamp
  lastActivity: string;     // ISO timestamp, updated on each message
  subscriptions: string[];  // Channel IDs (table:xxx, lobby, chat:xxx)
  instanceId: string;       // Gateway instance handling this connection
  metadata: ConnectionMetadata;
}

interface ConnectionMetadata {
  userAgent?: string;
  ipAddress?: string;
  tokenExpiry?: string;
}
```

### Subscription

- **Fields**: channel, connectionId, subscribedAt
- **Validation**: channel format validated (type:id)
- **Notes**: Used for routing broadcasts

```typescript
type ChannelType = "table" | "lobby" | "chat";

interface Subscription {
  channel: string;          // e.g., "table:abc123", "lobby", "chat:abc123"
  connectionId: string;
  subscribedAt: string;
}
```

### ChatMessage

- **Fields**: messageId, tableId, userId, nickname, content, timestamp
- **Validation**: content max 500 chars, userId required
- **Notes**: Stored with 24h TTL, per-table ordered list

```typescript
interface ChatMessage {
  messageId: string;
  tableId: string;
  userId: string;
  nickname: string;         // Cached from Player service
  content: string;
  timestamp: string;
  metadata?: ChatMessageMetadata;
}

interface ChatMessageMetadata {
  replyTo?: string;         // Future: reply threading
  edited?: boolean;
}
```

### RateLimitBucket

- **Fields**: key, count, windowStart, limit
- **Validation**: count >= 0
- **Notes**: Sliding window rate limiting

```typescript
interface RateLimitBucket {
  key: string;              // e.g., "user:abc123" or "ip:1.2.3.4"
  count: number;
  windowStart: number;      // Unix timestamp ms
  limit: number;
  windowMs: number;
}
```

### Session

- **Fields**: userId, connectionIds, lastSeen, deviceCount
- **Validation**: userId unique
- **Notes**: Aggregate view of user's connections across instances

```typescript
interface Session {
  userId: string;
  connectionIds: string[];
  lastSeen: string;
  deviceCount: number;
  status: "online" | "away" | "offline";
}
```

## Storage Notes

- **Connections**: Redis hash with TTL, keyed by connectionId.
- **Subscriptions**: Redis sets per channel for efficient broadcast lookup.
- **Chat Messages**: Redis lists per table with LTRIM for 24h retention.
- **Rate Limits**: Redis strings with TTL for sliding window.
- **Sessions**: Redis hash for presence aggregation.
- **Pub/Sub**: Redis pub/sub channel `gateway:events` for cross-instance sync.

## Redis Key Namespace

```
gateway:connections:{connectionId}         # Connection JSON (TTL: 1h)
gateway:connections:by-user:{userId}       # Set of connectionIds

gateway:subscriptions:{channel}            # Set of connectionIds
gateway:subscriptions:by-conn:{connId}     # Set of channels

gateway:chat:{tableId}                     # List of ChatMessage JSON (capped)
gateway:chat:{tableId}:latest              # Latest message timestamp

gateway:ratelimit:user:{userId}            # Counter with TTL
gateway:ratelimit:ip:{ip}                  # Counter with TTL

gateway:sessions:{userId}                  # Session JSON
gateway:sessions:online                    # Sorted set (lastSeen -> userId)

gateway:instances                          # Set of active instance IDs
gateway:instances:{instanceId}:connections # Set of connectionIds
```

## Pub/Sub Channels

```
gateway:events                             # Cross-instance event sync
  - table:{tableId}                        # Table state updates
  - chat:{tableId}                         # Chat messages
  - lobby                                  # Lobby updates
  - presence:{userId}                      # Presence changes
  - system                                 # System broadcasts
```

## Message Types

### Client -> Gateway

```typescript
type ClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "chat"; tableId: string; content: string }
  | { type: "action"; tableId: string; action: string; amount?: number }
  | { type: "ping" }
  | { type: "resync"; tableId: string };
```

### Gateway -> Client

```typescript
type ServerMessage =
  | { type: "connected"; connectionId: string }
  | { type: "subscribed"; channel: string }
  | { type: "unsubscribed"; channel: string }
  | { type: "tableState"; tableId: string; state: TableState }
  | { type: "tablePatch"; tableId: string; patch: Partial<TableState> }
  | { type: "chat"; message: ChatMessage }
  | { type: "chatError"; reason: string }
  | { type: "lobbyUpdate"; tables: TableSummary[] }
  | { type: "error"; code: string; message: string }
  | { type: "pong" }
  | { type: "rateLimit"; retryAfter: number };
```

## Relationships

- **Connection** 1:N **Subscription**
- **Session** 1:N **Connection**
- **ChatMessage** N:1 **Table** (via tableId)

## State Transitions

### Connection Lifecycle

```
CONNECTING -> AUTHENTICATED -> ACTIVE -> DISCONNECTED
                                 |
                                 v
                             IDLE (no activity) -> DISCONNECTED
```

### Subscription Lifecycle

```
REQUESTED -> SUBSCRIBED -> UNSUBSCRIBED
```

## Consistency Guarantees

- **Connections**: Eventual consistency across instances via pub/sub.
- **Subscriptions**: Immediately consistent within instance, eventually across.
- **Chat**: At-most-once delivery; missed messages retrievable via history.
- **Rate Limits**: Best-effort across instances (may slightly exceed limits).
- **Presence**: Eventually consistent with 30-second staleness acceptable.

## Cleanup Procedures

- **Disconnected connections**: Removed from Redis immediately on disconnect.
- **Stale connections**: Background job removes connections with no heartbeat >60s.
- **Chat history**: LTRIM keeps only last 1000 messages per table.
- **Expired sessions**: Removed when all connections closed and 5-min grace period passes.
