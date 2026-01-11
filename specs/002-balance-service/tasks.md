# Tasks: Balance Service

## Phase 1: Service Scaffolding

### T001: Initialize balance service package
- **File**: `apps/balance/package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: typescript, express, @grpc/grpc-js, @grpc/proto-loader, ioredis

### T002: Configure TypeScript
- **File**: `apps/balance/tsconfig.json`
- **Acceptance**: Matches api service configuration, strict mode enabled

### T003: Create server entry point
- **File**: `apps/balance/src/server.ts`
- **Acceptance**: Express server starts on port 3002, gRPC on 50051

### T004: Add configuration management
- **File**: `apps/balance/src/config.ts`
- **Acceptance**: Environment variables loaded with defaults

### T005: Create Dockerfile
- **File**: `apps/balance/Dockerfile`
- **Acceptance**: `docker build` succeeds, container runs

### T006: Add health endpoint
- **File**: `apps/balance/src/api/http/routes/health.ts`
- **Acceptance**: GET /api/health returns 200 with status

---

## Phase 2: Storage Layer

### T007: Implement Redis client
- **File**: `apps/balance/src/storage/redisClient.ts`
- **Acceptance**: Connection established, graceful fallback when unavailable
- **Pattern**: Match `apps/api/src/services/redisClient.ts`

### T008: Implement account store
- **File**: `apps/balance/src/storage/accountStore.ts`
- **Acceptance**: CRUD operations work, dual-storage pattern
- **Keys**: `balance:accounts:{id}`, `balance:accounts:ids`

### T009: Implement transaction store
- **File**: `apps/balance/src/storage/transactionStore.ts`
- **Acceptance**: Append-only semantics, query by account
- **Keys**: `balance:transactions:{id}`, `balance:transactions:by-account:{id}`

### T010: Implement reservation store
- **File**: `apps/balance/src/storage/reservationStore.ts`
- **Acceptance**: Expiry sorted set maintained
- **Keys**: `balance:reservations:{id}`, `balance:reservations:expiry`

### T011: Implement ledger store
- **File**: `apps/balance/src/storage/ledgerStore.ts`
- **Acceptance**: Checksum chain verified on append
- **Keys**: `balance:ledger:{accountId}`, `balance:ledger:latest-checksum:{id}`

### T012: Implement idempotency store
- **File**: `apps/balance/src/storage/idempotencyStore.ts`
- **Acceptance**: 24h TTL, cached response retrieval
- **Keys**: `balance:transactions:idempotency:{key}`

---

## Phase 3: Domain & Services

### T013: Define domain types
- **File**: `apps/balance/src/domain/types.ts`
- **Acceptance**: All entities from data-model.md defined

### T014: Implement account service
- **File**: `apps/balance/src/services/accountService.ts`
- **Functions**: getBalance, ensureAccount, creditBalance, debitBalance
- **Acceptance**: Optimistic locking works, negative balance rejected

### T015: Implement reservation service
- **File**: `apps/balance/src/services/reservationService.ts`
- **Functions**: reserve, commit, release, getActiveReservations
- **Acceptance**: Two-phase flow works, expiry handled

### T016: Implement ledger service
- **File**: `apps/balance/src/services/ledgerService.ts`
- **Functions**: appendEntry, getEntries, verifyIntegrity
- **Acceptance**: Checksum chain correct, queries work

### T017: Implement table pot service
- **File**: `apps/balance/src/services/tablePotService.ts`
- **Functions**: createPot, recordContribution, settle, cancel
- **Acceptance**: Pot calculations match existing logic

### T018: Implement idempotency service
- **File**: `apps/balance/src/services/idempotencyService.ts`
- **Functions**: check, record, withIdempotency wrapper
- **Acceptance**: Duplicate requests return cached response

---

## Phase 4: API Layer

### T019: Create HTTP router
- **File**: `apps/balance/src/api/http/router.ts`
- **Acceptance**: Routes mounted, middleware applied

### T020: Implement account routes
- **File**: `apps/balance/src/api/http/routes/accounts.ts`
- **Endpoints**: GET balance, POST deposit, POST withdraw, GET transactions
- **Acceptance**: OpenAPI spec compliance

### T021: Implement auth middleware
- **File**: `apps/balance/src/api/http/middleware/auth.ts`
- **Acceptance**: JWT validation matches api service

### T022: Implement idempotency middleware
- **File**: `apps/balance/src/api/http/middleware/idempotency.ts`
- **Acceptance**: Idempotency-Key header required for mutations

### T023: Create gRPC server
- **File**: `apps/balance/src/api/grpc/server.ts`
- **Acceptance**: Proto loaded, server listening on 50051

### T024: Implement gRPC handlers
- **File**: `apps/balance/src/api/grpc/handlers.ts`
- **Acceptance**: All BalanceService methods implemented

---

## Phase 5: Background Jobs

### T025: Implement reservation expiry job
- **File**: `apps/balance/src/jobs/reservationExpiry.ts`
- **Acceptance**: Expired reservations released every 5 seconds

### T026: Implement ledger verification job
- **File**: `apps/balance/src/jobs/ledgerVerification.ts`
- **Acceptance**: Checksum chain verified, alerts on corruption

---

## Phase 6: Poker Service Integration

### T027: Create balance client
- **File**: `apps/api/src/clients/balanceClient.ts`
- **Acceptance**: gRPC client with retry and circuit breaker

### T028: Modify joinSeat for two-phase buy-in
- **File**: `apps/api/src/services/tableService.ts`
- **Lines**: 58-114
- **Acceptance**: Reserve before join, commit/release after

### T029: Modify leaveSeat for cash-out
- **File**: `apps/api/src/services/tableService.ts`
- **Lines**: 117-137
- **Acceptance**: Cash-out processed before clearing seat

### T030: Modify settleShowdown for winnings
- **File**: `apps/api/src/engine/handEngine.ts`
- **Lines**: 249-301
- **Acceptance**: Winnings recorded via balance service

### T031: Add balance service dependency
- **File**: `apps/api/package.json`
- **Acceptance**: gRPC client packages added

---

## Phase 7: Testing

### T032: Unit tests for account service
- **File**: `apps/balance/tests/unit/accountService.test.ts`
- **Coverage**: All functions, edge cases

### T033: Unit tests for reservation service
- **File**: `apps/balance/tests/unit/reservationService.test.ts`
- **Coverage**: Reserve/commit/release/expiry flows

### T034: Unit tests for ledger service
- **File**: `apps/balance/tests/unit/ledgerService.test.ts`
- **Coverage**: Checksum verification, corruption detection

### T035: Integration tests for HTTP API
- **File**: `apps/balance/tests/integration/http.test.ts`
- **Coverage**: All endpoints, auth, idempotency

### T036: Integration tests for gRPC API
- **File**: `apps/balance/tests/integration/grpc.test.ts`
- **Coverage**: All methods, error cases

### T037: Contract tests
- **File**: `apps/balance/tests/contract/balance.contract.test.ts`
- **Coverage**: OpenAPI and proto compliance

### T038: E2E buy-in/cash-out flow
- **File**: `apps/balance/tests/e2e/buyInCashOut.test.ts`
- **Coverage**: Full flow through poker service

---

## Phase 8: Infrastructure

### T039: Add to Docker Compose
- **File**: `infra/docker-compose.yaml`
- **Acceptance**: Service starts with dependencies

### T040: Add Grafana dashboard
- **File**: `infra/grafana/dashboards/balance.json`
- **Metrics**: Balance operations, latencies, errors

### T041: Add observability setup
- **File**: `apps/balance/src/observability/otel.ts`
- **Acceptance**: Traces exported, metrics scraped

### T042: Add Prometheus metrics
- **File**: `apps/balance/src/observability/metrics.ts`
- **Metrics**: balance_operations_total, balance_latency_seconds, reservation_expiry_total

---

## Task Dependencies

```
T001 -> T002 -> T003 -> T004 -> T005 -> T006
                  |
                  v
T007 -> T008 -> T009 -> T010 -> T011 -> T012
                  |
                  v
        T013 -> T014 -> T015 -> T016 -> T017 -> T018
                  |
                  v
T019 -> T020 -> T021 -> T022 -> T023 -> T024
                  |
                  v
              T025 -> T026
                  |
                  v
T027 -> T028 -> T029 -> T030 -> T031
                  |
                  v
T032 -> T033 -> T034 -> T035 -> T036 -> T037 -> T038
                  |
                  v
        T039 -> T040 -> T041 -> T042
```
