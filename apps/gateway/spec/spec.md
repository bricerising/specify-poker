# Feature Specification: Gateway Service

**Service**: `@specify-poker/gateway`
**Created**: 2026-01-12
**Status**: Planned

## Overview

The Gateway Service is the entry point for all client connections. It handles
authentication, WebSocket termination, request routing, rate limiting, and
real-time message delivery including chat. It coordinates with backend services
via gRPC and synchronizes state across instances using Redis pub/sub.

## User Scenarios & Testing

### User Story 1 - Authenticated Connection (Priority: P1)

As a player, I can connect to the poker system with my credentials and maintain
a persistent WebSocket connection for real-time updates.

**Why this priority**: Without authenticated connections, no other functionality
is accessible; this is the entry point for all users.

**Independent Test**: A user connects with a valid JWT, receives a connection
acknowledgment, and can subscribe to table updates.

**Acceptance Scenarios**:

1. **Given** a user with a valid JWT, **When** they connect via WebSocket,
   **Then** the connection is established and a unique connection ID is assigned.
2. **Given** a user with an invalid or expired JWT, **When** they attempt to
   connect, **Then** the connection is rejected with an appropriate error.
3. **Given** a connected user, **When** their JWT expires, **Then** they are
   notified and must reauthenticate.

---

### User Story 2 - Real-Time Table Updates (Priority: P1)

As a player, I can subscribe to table updates and receive real-time game state
changes with minimal latency.

**Why this priority**: Real-time updates are essential for gameplay; delays
make the game unplayable.

**Independent Test**: A user subscribes to a table, another user takes an action,
and the first user receives the update within 100ms.

**Acceptance Scenarios**:

1. **Given** a connected user, **When** they subscribe to a table, **Then**
   they receive the current table state immediately.
2. **Given** a subscribed user, **When** any player takes an action, **Then**
   all subscribers receive the update in real-time.
3. **Given** a user subscribed to multiple tables, **When** updates occur on
   different tables, **Then** updates are delivered independently without blocking.

---

### User Story 3 - Chat Messaging (Priority: P2)

As a player, I can send and receive chat messages at my table with basic
moderation controls applied.

**Why this priority**: Chat enhances social experience but is not required for
core gameplay.

**Independent Test**: A user sends a chat message, other table participants
receive it, and a muted user's messages are blocked.

**Acceptance Scenarios**:

1. **Given** a seated player, **When** they send a chat message, **Then**
   all table participants receive the message.
2. **Given** a muted player, **When** they attempt to send a chat message,
   **Then** the message is blocked and they receive an error.
3. **Given** a chat message, **When** it is delivered, **Then** it includes
   sender info, timestamp, and message content.

---

### User Story 4 - Request Routing (Priority: P1)

As the system, I can route HTTP requests to appropriate backend services
and aggregate responses as needed.

**Why this priority**: Gateway must route requests for the system to function.

**Independent Test**: A request to /api/tables is routed to Game service,
response is returned to client.

**Acceptance Scenarios**:

1. **Given** an HTTP request to a known route, **When** the gateway receives it,
   **Then** it forwards to the appropriate backend service.
2. **Given** a backend service error, **When** the gateway receives it, **Then**
   it returns an appropriate error response to the client.
3. **Given** a request requiring authentication, **When** the JWT is invalid,
   **Then** the request is rejected before routing.

---

### Edge Cases

- Client disconnects and reconnects rapidly (connection flapping).
- WebSocket connection drops mid-message delivery.
- Backend service is unavailable during request routing.
- Rate limit exceeded for specific user or IP.
- Multiple browser tabs with same user credentials.
- Chat message contains prohibited content (future: content filtering).
- Pub/sub message arrives for disconnected subscription.
- JWT expires during active WebSocket session.

## Constitution Requirements

- **Authentication Boundary**: All requests MUST be authenticated at the gateway;
  backend services trust gateway-forwarded requests.
- **Connection Management**: Gateway MUST track all active connections and clean
  up resources on disconnect.
- **Rate Limiting**: Gateway MUST enforce per-user and per-IP rate limits to
  protect backend services.
- **Multi-Instance Sync**: Gateway instances MUST synchronize via Redis pub/sub
  to ensure all clients receive updates regardless of which instance they connect to.
- **Observability**: All connections, messages, and errors MUST be traced and
  metered for monitoring.

## Requirements

### Functional Requirements

- **FR-001**: System MUST authenticate WebSocket connections via JWT in query
  parameter or first message.
- **FR-002**: System MUST authenticate HTTP requests via Authorization header.
- **FR-003**: System MUST assign unique connection IDs to each WebSocket.
- **FR-004**: System MUST route HTTP requests to appropriate backend services
  based on path prefix.
- **FR-005**: System MUST support WebSocket subscriptions to tables, lobby, and
  chat channels.
- **FR-006**: System MUST broadcast table state updates to all subscribed clients.
- **FR-007**: System MUST broadcast chat messages to table participants.
- **FR-008**: System MUST check moderation status (muted) before delivering chat.
- **FR-009**: System MUST enforce rate limits per user and per IP.
- **FR-010**: System MUST use Redis pub/sub to synchronize across instances.
- **FR-011**: System MUST track connection presence for online/offline status.
- **FR-012**: System MUST support graceful connection handoff during deployments.
- **FR-013**: System MUST store chat messages with 24-hour retention.
- **FR-014**: System MUST expose health and readiness endpoints.
- **FR-015**: System MUST forward user identity to backend services via headers.

### Non-Functional Requirements

- **NFR-001**: WebSocket connection establishment MUST complete within 500ms.
- **NFR-002**: Message delivery latency MUST be under 100ms p95.
- **NFR-003**: System MUST support 10,000 concurrent WebSocket connections per
  instance.
- **NFR-004**: System MUST handle 1,000 messages per second per instance.
- **NFR-005**: System MUST export OTLP traces, metrics, and logs to the observability stack.
- **NFR-006**: System MUST maintain at least 80% unit test coverage across all core logic.
- **NFR-007**: Unit tests MUST reflect realistic consumer behavior and edge cases.

### Key Entities

- **Connection**: Active WebSocket connection with user ID and subscriptions.
- **Subscription**: Channel subscription (table, lobby, chat) for a connection.
- **ChatMessage**: Message with sender, table, content, and timestamp.
- **RateLimitBucket**: Per-user and per-IP request counters.
- **Session**: User session with connection IDs and last activity.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 99.99% of authenticated connection attempts succeed within 500ms.
- **SC-002**: 95% of messages delivered within 100ms of send.
- **SC-003**: 0% of unauthenticated requests reach backend services.
- **SC-004**: Rate limiting triggers within 1 second of threshold breach.
- **SC-005**: Multi-instance message delivery succeeds for 99.9% of broadcasts.

## Assumptions

- JWT tokens are issued by external identity provider (Keycloak).
- Redis is available for pub/sub and connection state.
- Backend services expose gRPC interfaces.
- Chat moderation state is provided by Game service.
- Connection presence is best-effort (eventual consistency acceptable).
