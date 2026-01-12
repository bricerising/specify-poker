# Tasks: Notify Service

## Phase 1: Service Scaffolding

### T001: Initialize notify service package
- **File**: `package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: typescript, @grpc/grpc-js, redis, web-push

### T002: Configure TypeScript
- **File**: `tsconfig.json`
- **Acceptance**: Matches project configuration, strict mode enabled

### T003: Create server entry point
- **File**: `src/server.ts`
- **Acceptance**: gRPC server starts on port 50055

### T004: Add configuration management
- **File**: `src/config.ts`
- **Acceptance**: Environment variables loaded with defaults (including VAPID keys)

### T005: Create Dockerfile
- **File**: `Dockerfile`
- **Acceptance**: `docker build` succeeds, container runs

### T006: Add health endpoint
- **File**: `src/api/grpc/handlers/health.ts`
- **Acceptance**: Health check method returns SERVING

---

## Phase 2: Storage Layer

### T007: Implement Redis client
- **File**: `src/storage/redisClient.ts`
- **Acceptance**: Connection established, graceful fallback

### T008: Implement subscription store
- **File**: `src/storage/subscriptionStore.ts`
- **Functions**: save, delete, listByUserId
- **Acceptance**: CRUD operations work, uses `notify:` prefix

---

## Phase 3: Domain & Services

### T010: Define domain types
- **File**: `src/domain/types.ts`
- **Acceptance**: PushSubscription and NotificationPayload defined

### T011: Implement subscription service
- **File**: `src/services/subscriptionService.ts`
- **Functions**: register, unregister, getSubscriptions
- **Acceptance**: Core logic migrated from monolith

### T012: Implement push sender service
- **File**: `src/services/pushSenderService.ts`
- **Functions**: sendNotification, sendToUser
- **Acceptance**: Integrates with `web-push` library, handles 404/410 errors

---

## Phase 4: gRPC API

### T013: Create proto definitions
- **File**: `proto/notify.proto`
- **Acceptance**: Register, Unregister, and NotifyUser methods defined

### T014: Implement gRPC server
- **File**: `src/api/grpc/server.ts`
- **Acceptance**: Proto loaded, server listening

### T015: Implement subscription handlers
- **File**: `src/api/grpc/handlers/subscriptions.ts`
- **Acceptance**: Register and Unregister methods work

### T016: Implement notification handlers
- **File**: `src/api/grpc/handlers/notifications.ts`
- **Acceptance**: NotifyUser method works

---

## Phase 5: Observability

### T017: Implement structured logging
- **File**: `src/observability/logger.ts`
- **Acceptance**: JSON logs with trace and span IDs in context written to stdout for Loki
- **Dependencies**: pino or winston

### T018: Implement distributed tracing
- **File**: `src/observability/otel.ts`
- **Acceptance**: instrumentation for gRPC and web-push, sent to Tempo
- **Dependencies**: @opentelemetry/sdk-node, @opentelemetry/instrumentation-grpc

### T019: Implement Prometheus metrics
- **File**: `src/observability/metrics.ts`
- **Acceptance**: Metrics for notification volume, success/failure rates, and gRPC performance
- **Dependencies**: prom-client

---

## Phase 6: Testing

### T020: Unit tests for subscription service
- **File**: `tests/unit/subscriptionService.test.ts`
- **Coverage**: Register, unregister, retrieval

### T021: Unit tests for push sender
- **File**: `tests/unit/pushSenderService.test.ts`
- **Coverage**: Web push delivery, error handling

### T022: Integration tests for gRPC API
- **File**: `tests/integration/grpc.test.ts`
- **Coverage**: All service methods

---

## Task Dependencies

```
T001 -> T002 -> T003 -> T004 -> T005 -> T006
                  |
                  v
        T007 -> T008
                  |
                  v
        T010 -> T011 -> T012
                  |
                  v
        T013 -> T014 -> T015 -> T016
                  |
                  v
        T017 -> T018 -> T019
                  |
                  v
        T020 -> T021 -> T022
```

## Migration Notes

### Files to Extract from apps/api

- `src/services/pushNotifications.ts` -> Notify subscription service
- `src/services/pushSender.ts` -> Notify push sender service
- `src/http/routes/push.ts` -> Reference for API contract (now handled via gRPC)

### Key Differences from Current API

1. **gRPC-only**: Internal service calls replace direct module imports.
2. **Dedicated storage**: Redis namespaces standardized to `notify:`.
3. **Enhanced observability**: Full OTEL and Prometheus integration.
