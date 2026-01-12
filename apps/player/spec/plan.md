# Implementation Plan: Player Service

## Overview

This document outlines the implementation plan for the player service microservice.
The service manages user profiles, statistics, and social connections.

## Architecture

```
┌─────────────────────┐         gRPC          ┌─────────────────────┐
│   Gateway           │◄─────────────────────►│  Player Service     │
│   (Auth/Routing)    │                       │  (apps/player)      │
│                     │                       │   gRPC: 50052       │
└─────────────────────┘                       └─────────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │       Redis         │
                                              │   (Profile Cache)   │
                                              └─────────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │     PostgreSQL      │
                                              │   (Persistent DB)   │
                                              └─────────────────────┘
```

## Directory Structure

```
apps/player/
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
│   ├── api/
│   │   └── grpc/             # gRPC API
│   │       ├── server.ts
│   │       └── handlers/
│   ├── domain/
│   │   └── types.ts          # Domain types
│   ├── services/
│   │   ├── profileService.ts
│   │   ├── statsService.ts
│   │   └── friendsService.ts
│   ├── storage/
│   │   ├── db.ts             # Postgres client
│   │   ├── redisClient.ts
│   │   ├── profileStore.ts
│   │   └── friendsStore.ts
│   └── observability/
│       ├── logger.ts
│       └── metrics.ts
└── tests/
    ├── unit/
    └── integration/
```

## Implementation Phases

### Phase 1: Service Scaffolding
- Initialize Node.js project.
- Set up gRPC server and basic configuration.

### Phase 2: Storage Layer
- Implement PostgreSQL schema for profiles, friends, and statistics.
- Implement Redis caching for profiles to ensure low-latency lookups.

### Phase 3: Core Logic Migration
- Move profile and friends logic from `apps/api`.
- Implement aggregate statistics calculation (hands played, wins).

### Phase 4: Privacy & Compliance
- Implement data deletion (GDPR) logic.
- Ensure sensitive data is not logged.

### Phase 5: Observability
- Implement structured logging with trace context (stdout/Loki).
- Export metrics for profile updates, friend requests, and stats accuracy (Prometheus).
- Instrument database and gRPC calls with OpenTelemetry (Tempo).

## Success Metrics

- P99 profile lookup latency < 50ms (cached).
- 100% success rate for GDPR deletion requests.
- Consistent statistics across service restarts.
