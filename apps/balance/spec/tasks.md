# Tasks: Balance Service

## Phase 1: Service Scaffolding

### T001: Initialize balance service package
- **File**: `package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: typescript, express, @grpc/grpc-js, @grpc/proto-loader, redis

### T002: Configure TypeScript
- **File**: `tsconfig.json`
- **Acceptance**: Matches api service configuration, strict mode enabled

### T003: Create server entry point
- **File**: `src/server.ts`
- **Acceptance**: Express server starts on port 3002, gRPC on 50051

### T004: Add configuration management
- **File**: `src/config.ts`
- **Acceptance**: Environment variables loaded with defaults

### T005: Create Dockerfile
- **File**: `Dockerfile`
- **Acceptance**: `docker build` succeeds, container runs

### T006: Add health endpoint
- **File**: `src/api/http/routes/health.ts`
- **Acceptance**: GET /api/health returns 200 with status

---

## Phase 2: Storage Layer

### T007: Implement Redis client
- **File**: `src/storage/redisClient.ts`
- **Acceptance**: Connection established, graceful fallback when unavailable

### T008: Implement account store
- **File**: `src/storage/accountStore.ts`
- **Acceptance**: CRUD operations work, dual-storage pattern
- **Keys**: `balance:accounts:{id}`, `balance:accounts:ids`

### T009: Implement transaction store
- **File**: `src/storage/transactionStore.ts`
- **Acceptance**: Append-only semantics, query by account
- **Keys**: `balance:transactions:{id}`, `balance:transactions:by-account:{id}`

### T010: Implement reservation store
- **File**: `src/storage/reservationStore.ts`
- **Acceptance**: Expiry sorted set maintained
- **Keys**: `balance:reservations:{id}`, `balance:reservations:expiry`

### T011: Implement ledger store
- **File**: `src/storage/ledgerStore.ts`
- **Acceptance**: Checksum chain verified on append
- **Keys**: `balance:ledger:{accountId}`, `balance:ledger:latest-checksum:{id}`

### T012: Implement idempotency store
- **File**: `src/storage/idempotencyStore.ts`
- **Acceptance**: 24h TTL, cached response retrieval
- **Keys**: `balance:transactions:idempotency:{key}`

### T013: Implement table pot store
- **File**: `src/storage/tablePotStore.ts`
- **Acceptance**: CRUD for active pots
- **Keys**: `balance:pots:{tableId}:{handId}`, `balance:pots:active`

---

## Phase 3: Domain & Services

### T014: Define domain types
- **File**: `src/domain/types.ts`
- **Acceptance**: All entities from data-model.md defined

### T015: Implement account service
- **File**: `src/services/accountService.ts`
- **Functions**: getBalance, ensureAccount, creditBalance, debitBalance
- **Acceptance**: Optimistic locking works, negative balance rejected

### T016: Implement reservation service
- **File**: `src/services/reservationService.ts`
- **Functions**: reserve, commit, release, getActiveReservations
- **Acceptance**: Two-phase flow works, expiry handled

### T017: Implement ledger service
- **File**: `src/services/ledgerService.ts`
- **Functions**: appendEntry, getEntries, verifyIntegrity
- **Acceptance**: Checksum chain correct, queries work

### T018: Implement table pot service
- **File**: `src/services/tablePotService.ts`
- **Functions**: createPot, recordContribution, settle, cancel
- **Acceptance**: Pot calculations match existing logic

---

## Phase 4: API Layer

### T019: Create HTTP router
- **File**: `src/api/http/router.ts`
- **Acceptance**: Routes mounted, middleware applied

### T020: Implement account routes
- **File**: `src/api/http/routes/accounts.ts`
- **Endpoints**: GET balance, POST deposit, POST withdraw, GET transactions
- **Acceptance**: OpenAPI spec compliance

### T021: Create gRPC server
- **File**: `src/api/grpc/server.ts`
- **Acceptance**: Proto loaded, server listening on 50051

### T022: Implement gRPC handlers
- **File**: `src/api/grpc/handlers.ts`
- **Acceptance**: All BalanceService methods implemented

---

## Phase 5: Background Jobs

### T023: Implement reservation expiry job
- **File**: `src/jobs/reservationExpiry.ts`
- **Acceptance**: Expired reservations released every 5 seconds

### T024: Implement ledger verification job
- **File**: `src/jobs/ledgerVerification.ts`
- **Acceptance**: Checksum chain verified, alerts on corruption

---

## Phase 6: Testing

### T025: Unit tests for account service
- **File**: `tests/unit/accountService.test.ts`
- **Coverage**: All functions, edge cases

### T026: Unit tests for reservation service
- **File**: `tests/unit/reservationService.test.ts`
- **Coverage**: Reserve/commit/release/expiry flows

### T027: Unit tests for ledger service
- **File**: `tests/unit/ledgerService.test.ts`
- **Coverage**: Checksum verification, corruption detection

### T028: Integration tests for HTTP API
- **File**: `tests/integration/http.test.ts`
- **Coverage**: All endpoints, idempotency

### T029: Integration tests for gRPC API
- **File**: `tests/integration/grpc.test.ts`
- **Coverage**: All methods, error cases

---

## Task Dependencies

```
T001 -> T002 -> T003 -> T004 -> T005 -> T006
                  |
                  v
T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013
                  |
                  v
        T014 -> T015 -> T016 -> T017 -> T018
                  |
                  v
        T019 -> T020 -> T021 -> T022
                  |
                  v
              T023 -> T024
                  |
                  v
T025 -> T026 -> T027 -> T028 -> T029
```
