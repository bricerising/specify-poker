# Implementation Plan: Balance Service

## Overview

This document outlines the implementation plan for extracting balance management
into a separate microservice. The balance service will handle user account
balances, table pot management, and transaction ledger with real-money ready
design.

## Architecture

```
┌─────────────────────┐         gRPC          ┌─────────────────────┐
│   Poker Service     │◄─────────────────────►│  Balance Service    │
│   (apps/api)        │                       │  (apps/balance)     │
│   Port: 3001        │                       │   HTTP: 3002        │
│                     │                       │   gRPC: 50051       │
└─────────────────────┘                       └─────────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │       Redis         │
                                              │   Port: 6379        │
                                              └─────────────────────┘
```

## Implementation Phases

### Phase 1: Service Scaffolding

1. Create `apps/balance/` directory structure
2. Initialize Node.js project with TypeScript
3. Set up Express server for HTTP API
4. Set up gRPC server for internal API
5. Configure OpenTelemetry and Prometheus metrics
6. Add health check endpoints

**Files to create:**
- `apps/balance/package.json`
- `apps/balance/tsconfig.json`
- `apps/balance/Dockerfile`
- `apps/balance/src/server.ts`
- `apps/balance/src/config.ts`

### Phase 2: Storage Layer

1. Implement Redis client (matching existing pattern)
2. Implement account store with dual-storage
3. Implement transaction store
4. Implement reservation store with expiry
5. Implement ledger store with checksums

**Files to create:**
- `apps/balance/src/storage/redisClient.ts`
- `apps/balance/src/storage/accountStore.ts`
- `apps/balance/src/storage/transactionStore.ts`
- `apps/balance/src/storage/reservationStore.ts`
- `apps/balance/src/storage/ledgerStore.ts`

### Phase 3: Domain & Services

1. Define domain types
2. Implement account service (balance operations)
3. Implement reservation service (two-phase commit)
4. Implement ledger service (audit trail)
5. Implement table pot service

**Files to create:**
- `apps/balance/src/domain/types.ts`
- `apps/balance/src/services/accountService.ts`
- `apps/balance/src/services/reservationService.ts`
- `apps/balance/src/services/ledgerService.ts`
- `apps/balance/src/services/tablePotService.ts`
- `apps/balance/src/services/idempotencyService.ts`

### Phase 4: API Layer

1. Implement HTTP routes for account management
2. Implement gRPC handlers for internal operations
3. Add authentication middleware
4. Add idempotency middleware

**Files to create:**
- `apps/balance/src/api/http/router.ts`
- `apps/balance/src/api/http/routes/accounts.ts`
- `apps/balance/src/api/http/routes/health.ts`
- `apps/balance/src/api/http/middleware/auth.ts`
- `apps/balance/src/api/http/middleware/idempotency.ts`
- `apps/balance/src/api/grpc/server.ts`
- `apps/balance/src/api/grpc/handlers.ts`

### Phase 5: Background Jobs

1. Implement reservation expiry job
2. Implement ledger integrity verification job

**Files to create:**
- `apps/balance/src/jobs/reservationExpiry.ts`
- `apps/balance/src/jobs/ledgerVerification.ts`

### Phase 6: Poker Service Integration

1. Create balance client for poker service
2. Modify `joinSeat()` to use two-phase buy-in
3. Modify `leaveSeat()` to process cash-out
4. Modify `settleShowdown()` to record winnings
5. Add feature flag for gradual rollout

**Files to modify:**
- `apps/api/src/services/tableService.ts`
- `apps/api/src/engine/handEngine.ts`
- `apps/api/package.json`

**Files to create:**
- `apps/api/src/clients/balanceClient.ts`

### Phase 7: Testing

1. Unit tests for all services
2. Integration tests for API endpoints
3. Contract tests for gRPC
4. End-to-end tests for full flow

**Files to create:**
- `apps/balance/tests/unit/*.test.ts`
- `apps/balance/tests/integration/*.test.ts`
- `apps/balance/tests/contract/*.test.ts`

### Phase 8: Infrastructure

1. Add balance service to Docker Compose
2. Add Grafana dashboard for balance metrics
3. Update CI/CD pipeline

**Files to modify:**
- `infra/docker-compose.yaml`
- `infra/grafana/dashboards/`

## Key Design Decisions

### Two-Phase Buy-In

The buy-in process uses a reservation pattern to ensure consistency:

1. **Reserve**: Poker service requests funds be reserved
2. **Commit/Release**: Based on seat join success/failure

This prevents:
- Double-spending across concurrent join attempts
- Lost funds if seat join fails after deduction
- Race conditions between balance check and deduction

### Idempotency

All mutating operations accept an idempotency key:

- Key format: `{operation}:{tableId}:{userId}:{timestamp}`
- Keys cached in Redis with 24-hour TTL
- Duplicate requests return cached response

### Ledger Integrity

The ledger uses a checksum chain:

```
Entry N checksum = SHA-256(Entry N data + Entry N-1 checksum)
```

This ensures:
- Tampering is detectable
- Missing entries are detectable
- Full audit trail for compliance

### Graceful Degradation

When Redis is unavailable:
- In-memory cache continues serving reads
- Writes are queued for retry
- Poker service falls back to permissive mode (logged for reconciliation)

## Migration Strategy

1. **Phase A**: Deploy balance service alongside poker service (no integration)
2. **Phase B**: Enable balance client with feature flag (dual-write mode)
3. **Phase C**: Require balance validation for buy-in
4. **Phase D**: Remove legacy free-chip assignment

## Success Metrics

- P99 latency < 50ms for gRPC calls
- Zero negative balances
- 100% ledger integrity (verified by background job)
- < 1% reservation expiry rate (indicates timeout tuning needed)
