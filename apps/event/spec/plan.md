# Implementation Plan: Event Service

## Overview

This document outlines the implementation plan for the event service microservice.
The service provides append-only event storage, hand history persistence, and replay capabilities.

## Architecture

```
┌─────────────────────┐         gRPC          ┌─────────────────────┐
│   Game Service      │─────────────────────► │  Event Service      │
│                     │                       │  (apps/event)       │
│                     │                       │   gRPC: 50054       │
└─────────────────────┘                       └─────────────────────┘
                                                       │
                                            ┌──────────┴──────────┐
                                            ▼                     ▼
                                   ┌─────────────────────┐ ┌─────────────────────┐
                                   │       Redis         │ │     PostgreSQL      │
                                   │   (Hot Streams)     │ │   (Cold Storage)    │
                                   └─────────────────────┘ └─────────────────────┘
```

## Directory Structure

```
apps/event/
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
│   │   ├── eventIngestionService.ts
│   │   ├── eventQueryService.ts
│   │   ├── handRecordService.ts
│   │   └── replayService.ts
│   ├── storage/
│   │   ├── db.ts             # Postgres client
│   │   ├── redisClient.ts
│   │   ├── eventStore.ts
│   │   └── handRecordStore.ts
│   └── jobs/
│       ├── handMaterializer.ts
│       └── archiver.ts
└── tests/
    ├── unit/
    └── integration/
```

## Implementation Phases

### Phase 1: Service Scaffolding
- Initialize Node.js project with TypeScript.
- Set up gRPC server for internal API.
- Create Dockerfile and basic config.

### Phase 2: Database Setup
- Set up PostgreSQL schema for events and hand records.
- Set up Redis for real-time streams.

### Phase 3: Storage Layer
- Implement event store for raw game events.
- Implement hand record store for summarized hand data.

### Phase 4: Domain & Services
- Implement event ingestion and validation.
- Implement query service for hand history.
- Implement state reconstruction for replays.

### Phase 5: Background Jobs
- Implement hand materializer to create summaries from raw events.
- Implement archiver for long-term storage management.

### Phase 6: Observability
- Implement structured logging with trace propagation (stdout/Loki).
- Export metrics for event volume, materialization lag, and query performance (Prometheus).
- Instrument gRPC and database calls with OpenTelemetry (Tempo).

### Phase 7: Analytics
- Create materialized views in PostgreSQL for BI-ready data access.
- Implement background jobs to refresh analytics summaries (e.g., daily active tables).

### Phase 8: Success Metrics

- 100% durability for all game events.
- P99 query latency < 500ms for hand history.
- Correct state reconstruction for 100% of completed hands.
