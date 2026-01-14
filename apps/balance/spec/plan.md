# Implementation Plan: Balance Service

## Overview

This document outlines the implementation plan for the balance service microservice.
The service handles user account balances, table pot management, and transaction
ledger with strong integrity and auditability for play-money chips in private games.

## Architecture

```
┌─────────────────────┐         gRPC          ┌─────────────────────┐
│   Poker Service     │◄─────────────────────►│  Balance Service    │
│   (apps/api)        │                       │  (apps/balance)     │
│   Port: 4000        │                       │   HTTP: 3002        │
│                     │                       │   gRPC: 50051       │
└─────────────────────┘                       └─────────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │       Redis         │
                                              │   Port: 6379        │
                                              └─────────────────────┘
```

## Directory Structure

```
apps/balance/
├── Dockerfile
├── package.json
├── tsconfig.json
├── spec/                     # This specification folder
│   ├── spec.md
│   ├── data-model.md
│   ├── plan.md
│   ├── tasks.md
│   ├── quickstart.md
│   └── research.md
├── src/
│   ├── server.ts             # Entry point
│   ├── config.ts             # Configuration
│   ├── api/
│   │   ├── http/             # HTTP API
│   │   │   ├── router.ts
│   │   │   ├── routes/
│   │   │   └── middleware/
│   │   └── grpc/             # gRPC API
│   │       ├── server.ts
│   │       └── handlers.ts
│   ├── domain/
│   │   └── types.ts          # Domain types
│   ├── services/
│   │   ├── accountService.ts
│   │   ├── reservationService.ts
│   │   ├── ledgerService.ts
│   │   └── tablePotService.ts
│   ├── storage/
│   │   ├── redisClient.ts
│   │   ├── accountStore.ts
│   │   ├── transactionStore.ts
│   │   ├── reservationStore.ts
│   │   ├── ledgerStore.ts
│   │   ├── tablePotStore.ts
│   │   └── idempotencyStore.ts
│   ├── jobs/
│   │   ├── reservationExpiry.ts
│   │   └── ledgerVerification.ts
│   └── observability/
│       ├── otel.ts
│       └── metrics.ts
└── tests/
    ├── unit/
    ├── integration/
    └── contract/
```

## Implementation Phases

### Phase 1: Service Scaffolding
- Initialize Node.js project with TypeScript
- Set up Express server for HTTP API
- Set up gRPC server for internal API
- Add health check endpoints

### Phase 2: Storage Layer
- Implement Redis client (matching existing pattern)
- Implement account store with dual-storage
- Implement transaction store
- Implement reservation store with expiry
- Implement ledger store with checksums

### Phase 3: Domain & Services
- Define domain types
- Implement account service (balance operations)
- Implement reservation service (two-phase commit)
- Implement ledger service (audit trail)
- Implement table pot service

### Phase 4: API Layer
- Implement HTTP routes for account management
- Implement gRPC handlers for internal operations
- Add authentication middleware
- Add idempotency middleware

### Phase 5: Background Jobs
- Implement reservation expiry job
- Implement ledger integrity verification job

### Phase 6: Observability
- Implement structured logging with correlation IDs (Pino/Winston)
- Output logs to stdout/stderr in JSON format for collection by Loki
- Integrate OpenTelemetry for distributed tracing (sent to Tempo)
- Export Prometheus metrics (latency, throughput, error rates)
- Define custom business metrics (ledger verification failures)

### Phase 7: Analytics
- (Optional) Implement metrics for total chip supply and circulation velocity.
- (Optional) Track chip sources/sinks primarily to detect bugs or unintended inflation in a private instance.

### Phase 8: Testing
- Unit tests for all services
- Integration tests for API endpoints
- Contract tests for gRPC

## Key Design Decisions

### Two-Phase Buy-In

The buy-in process uses a reservation pattern:

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
- Strong auditability for debugging and dispute resolution

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
