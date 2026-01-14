# Tasks: Gateway Service

## Phase 1: Service Scaffolding

### T001: Initialize gateway service package
- **File**: `package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: typescript, express, ws, @grpc/grpc-js, redis, jsonwebtoken

### T002: Configure TypeScript
- **File**: `tsconfig.json`
- **Acceptance**: Matches project configuration, strict mode enabled

### T003: Create server entry point
- **File**: `src/server.ts`
- **Acceptance**: HTTP server starts on port 4000, WebSocket attached

### T004: Add configuration management
- **File**: `src/config.ts`
- **Acceptance**: Environment variables loaded with defaults

### T005: Create Dockerfile
- **File**: `Dockerfile`
- **Acceptance**: `docker build` succeeds, container runs

### T006: Add health endpoints
- **File**: `src/http/routes/health.ts`
- **Acceptance**: GET /health and /ready return appropriate status

---

## Phase 2: Authentication

### T007: Implement JWT validation
- **File**: `src/auth/jwt.ts`
- **Functions**: verifyToken, extractClaims, isExpired
- **Acceptance**: Valid tokens pass, invalid/expired rejected

### T008: Create auth middleware for HTTP
- **File**: `src/http/middleware/auth.ts`
- **Acceptance**: Protected routes require valid Authorization header

### T009: Create auth handler for WebSocket
- **File**: `src/ws/auth.ts`
- **Acceptance**: Connections authenticated via query param or first message

---

## Phase 3: Connection Management

### T010: Implement Redis client
- **File**: `src/storage/redisClient.ts`
- **Acceptance**: Connection pool established, graceful fallback

### T011: Implement connection store
- **File**: `src/storage/connectionStore.ts`
- **Functions**: save, get, delete, getByUser, getByChannel
- **Acceptance**: CRUD operations work, TTL managed

### T012: Implement WebSocket server
- **File**: `src/ws/server.ts`
- **Acceptance**: Accepts connections, assigns IDs, handles lifecycle

### T013: Implement connection registry
- **File**: `src/ws/connectionRegistry.ts`
- **Functions**: register, unregister, getConnection, broadcast
- **Acceptance**: Local registry synced with Redis

### T014: Implement heartbeat handler
- **File**: `src/ws/heartbeat.ts`
- **Acceptance**: Ping/pong keeps connections alive, stale connections closed

---

## Phase 4: Pub/Sub & Broadcasting

### T015: Implement pub/sub client
- **File**: `src/pubsub/client.ts`
- **Functions**: publish, subscribe, unsubscribe
- **Acceptance**: Messages flow between instances

### T016: Implement message router
- **File**: `src/pubsub/router.ts`
- **Acceptance**: Incoming pub/sub messages routed to appropriate handlers

### T017: Implement subscription manager
- **File**: `src/ws/subscriptions.ts`
- **Functions**: subscribe, unsubscribe, getSubscribers
- **Acceptance**: Channel subscriptions tracked, efficient broadcast lookup

### T018: Implement broadcast service
- **File**: `src/services/broadcastService.ts`
- **Functions**: broadcastToChannel, broadcastToUser, broadcastToAll
- **Acceptance**: Messages delivered to all subscribers across instances

---

## Phase 5: Request Routing

### T019: Create HTTP router
- **File**: `src/http/router.ts`
- **Acceptance**: Routes mounted, middleware applied

### T020: Implement service proxy
- **File**: `src/http/proxy.ts`
- **Functions**: proxyToGame, proxyToPlayer, proxyToBalance, proxyToEvent
- **Acceptance**: Requests forwarded with auth headers, responses returned

### T021: Create gRPC client manager
- **File**: `src/grpc/clients.ts`
- **Acceptance**: Connections to backend services established

### T022: Implement route handlers
- **File**: `src/http/routes/api.ts`
- **Acceptance**: All API routes proxy to appropriate backends

---

## Phase 6: Chat

### T023: Implement chat store
- **File**: `src/storage/chatStore.ts`
- **Functions**: saveMessage, getHistory, trimHistory
- **Acceptance**: Messages stored with 24h retention

### T024: Implement chat service
- **File**: `src/services/chatService.ts`
- **Functions**: sendMessage, getHistory, checkMuted
- **Acceptance**: Messages validated, mute check via Game service

### T025: Implement chat WebSocket handler
- **File**: `src/ws/handlers/chat.ts`
- **Acceptance**: Chat messages received, validated, broadcast

---

## Phase 7: Rate Limiting

### T026: Implement rate limit store
- **File**: `src/storage/rateLimitStore.ts`
- **Functions**: increment, check, reset
- **Acceptance**: Sliding window counters work

### T027: Create rate limit middleware
- **File**: `src/http/middleware/rateLimit.ts`
- **Acceptance**: HTTP requests throttled per user/IP

### T028: Create WebSocket rate limiter
- **File**: `src/ws/rateLimit.ts`
- **Acceptance**: WebSocket messages throttled, excess rejected

---

## Phase 8: Presence & Sessions

### T029: Implement session store
- **File**: `src/storage/sessionStore.ts`
- **Functions**: updatePresence, getSession, setOffline
- **Acceptance**: User presence tracked across connections

### T030: Implement presence service
- **File**: `src/services/presenceService.ts`
- **Functions**: setOnline, setAway, setOffline, getStatus
- **Acceptance**: Status changes broadcast to subscribers

---

## Phase 9: Message Handlers

### T031: Implement table message handler
- **File**: `src/ws/handlers/table.ts`
- **Functions**: handleSubscribe, handleAction, handleResync
- **Acceptance**: Table operations forwarded to Game service

### T032: Implement lobby message handler
- **File**: `src/ws/handlers/lobby.ts`
- **Functions**: handleSubscribe, broadcastUpdate
- **Acceptance**: Lobby updates delivered to subscribers

---

## Phase 10: Observability

### T033: Implement structured logging
- **File**: `src/observability/logger.ts`
- **Acceptance**: JSON logs with request context and correlation IDs written to stdout for Loki
- **Dependencies**: pino or winston

### T034: Implement distributed tracing
- **File**: `src/observability/otel.ts`
- **Acceptance**: Trace context initialized for all requests, propagated to gRPC
- **Dependencies**: @opentelemetry/sdk-node, @opentelemetry/instrumentation-express

### T035: Implement Prometheus metrics
- **File**: `src/observability/metrics.ts`
- **Acceptance**: Metrics for connection count, throughput, and error rates exposed
- **Dependencies**: prom-client

---

## Phase 11: Analytics

### T036: Implement session event emission
- **File**: `src/ws/server.ts`
- **Acceptance**: Emit SESSION_STARTED and SESSION_ENDED events to Event Service
- **Metadata**: Includes userId, duration (for end), and client type

---

## Phase 12: Testing

### T037: Unit tests for JWT validation
- **File**: `tests/unit/jwt.test.ts`
- **Coverage**: Valid, invalid, expired tokens

### T038: Unit tests for connection management
- **File**: `tests/unit/connections.test.ts`
- **Coverage**: Register, unregister, lookup, broadcast

### T039: Unit tests for rate limiting
- **File**: `tests/unit/rateLimit.test.ts`
- **Coverage**: Increment, threshold, reset

### T040: Integration tests for WebSocket
- **File**: `tests/integration/websocket.test.ts`
- **Coverage**: Connect, subscribe, receive updates, disconnect

### T041: Integration tests for HTTP proxy
- **File**: `tests/integration/proxy.test.ts`
- **Coverage**: Route to backends, error handling

### T042: Integration tests for chat
- **File**: `tests/integration/chat.test.ts`
- **Coverage**: Send, receive, history, mute check

---

## Task Dependencies

```
T001 -> T002 -> T003 -> T004 -> T005 -> T006
                  |
                  v
        T007 -> T008 -> T009
                  |
                  v
        T010 -> T011 -> T012 -> T013 -> T014
                  |
                  v
        T015 -> T016 -> T017 -> T018
                  |
                  v
        T019 -> T020 -> T021 -> T022
                  |
                  v
        T023 -> T024 -> T025
                  |
                  v
        T026 -> T027 -> T028
                  |
                  v
        T029 -> T030
                  |
                  v
        T031 -> T032
                  |
                  v
        T033 -> T034 -> T035
                  |
                  v
                T036
                  |
                  v
T037 -> T038 -> T039 -> T040 -> T041 -> T042
```

## Migration Notes

### Files to Extract from apps/api

- `src/ws/server.ts` -> Gateway WebSocket server
- `src/ws/pubsub.ts` -> Gateway pub/sub client
- `src/ws/connectionRegistry.ts` -> Gateway connection registry
- `src/ws/tableHub.ts` -> Gateway table handler (partial)
- `src/ws/chatHub.ts` -> Gateway chat handler
- `src/ws/lobbyHub.ts` -> Gateway lobby handler
- `src/auth/jwt.ts` -> Gateway JWT validation
- `src/http/middleware/auth.ts` -> Gateway auth middleware
- `src/http/middleware/rateLimit.ts` -> Gateway rate limiting
