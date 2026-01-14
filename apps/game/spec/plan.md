# Implementation Plan: Game Service

## Overview

This document outlines the implementation plan for the game service microservice.
The service is the core gameplay engine, managing tables, hands, and Texas Hold'em rules.

## Architecture

```
┌─────────────────────┐         gRPC          ┌─────────────────────┐
│   Gateway           │◄─────────────────────►│  Game Service       │
│                     │                       │  (apps/game)        │
│                     │                       │   gRPC: 50053       │
└─────────────────────┘                       └─────────────────────┘
          │                                            │
          │         gRPC / Redis PubSub                │
          ▼                                            ▼
┌─────────────────────┐                       ┌─────────────────────┐
│  Balance Service    │◄─────────────────────►│  Event Service      │
│  (Settlements)      │                       │  (Audit Trail)      │
└─────────────────────┘                       └─────────────────────┘
```

## Directory Structure

```
apps/game/
├── Dockerfile
├── package.json
├── tsconfig.json
├── spec/                     # This specification folder
│   ├── spec.md
│   ├── data-model.md
│   ├── plan.md
│   └── tasks.md
├── src/
│   ├── server.ts             # Entry point
│   ├── config.ts             # Configuration
│   ├── engine/               # Pure logic
│   │   ├── handEngine.ts
│   │   ├── rankings.ts
│   │   └── potCalculator.ts
│   ├── api/
│   │   └── grpc/             # gRPC API
│   │       ├── server.ts
│   │       └── handlers/
│   ├── domain/
│   │   └── types.ts          # Domain types
│   ├── services/
│   │   ├── tableService.ts
│   │   ├── tableRegistry.ts
│   │   └── moderationService.ts
│   ├── storage/
│   │   ├── redisClient.ts
│   │   └── tableStore.ts
│   └── observability/
│       ├── logger.ts
│       └── metrics.ts
└── tests/
    ├── unit/                 # Engine tests
    └── integration/
```

## Implementation Phases

### Phase 1: Engine Migration
- Move `handEngine.ts` and related logic from `apps/api`.
- Ensure pure logic is isolated and heavily unit-tested.

### Phase 2: Service Scaffolding
- Initialize gRPC server.
- Set up table registry using Redis for distributed state.

### Phase 3: Integration
- Implement gRPC client for Balance Service (buy-ins/settlements).
- Implement gRPC client for Event Service (audit trail).
- Set up Redis Pub/Sub for broadcasting state changes to Gateway.

### Phase 4: Lifecycle Management
- Implement table creation, joining, and leaving logic.
- Implement automatic turn timers and hand progression.

### Phase 5: Observability
- Implement structured logging with trace propagation (output to stdout/Loki).
- Export metrics for hand volume, table occupancy, and turn durations.
- Instrument gRPC calls with OpenTelemetry (sent to Tempo).

### Phase 6: Analytics
- Implement turn timing tracking per street to identify player friction points.
- Emit detailed hand outcome events for fairness and collusion analysis.

## Success Metrics

- 100% adherence to Texas Hold'em rules.
- P99 action processing latency < 50ms.
- 0% desync between Game Service and Balance Service.
