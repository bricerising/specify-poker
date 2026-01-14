# Implementation Plan: Gateway Service

## Overview

This document outlines the implementation plan for the gateway service microservice.
The Gateway is the entry point for all client connections (HTTP and WebSocket).

## Architecture

```
┌─────────────────────┐
│      Clients        │
│  (Web / Mobile)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐         gRPC          ┌─────────────────────┐
│   Gateway           │─────────────────────► │   Backend Services  │
│   (apps/gateway)    │◄───────────────────── │   (Game, Player...) │
│   Port: 4000 (WS)   │                       └─────────────────────┘
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│       Redis         │
│   (Pub/Sub Sync)    │
└─────────────────────┘
```

## Directory Structure

```
apps/gateway/
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
│   ├── auth/                 # JWT validation
│   ├── http/                 # Express/Koa router
│   ├── ws/                   # WebSocket handlers
│   ├── services/
│   │   ├── connectionManager.ts
│   │   └── routingService.ts
│   └── storage/
│       ├── redisClient.ts
│       └── sessionStore.ts
└── tests/
    ├── unit/
    └── e2e/
```

## Implementation Phases

### Phase 1: Authentication & Routing
- Move JWT validation from `apps/api`.
- Implement HTTP proxying to backend services.

### Phase 2: WebSocket Termination
- Implement WebSocket server.
- Support subscription logic (Lobby, Tables).

### Phase 3: Multi-Instance Synchronization
- Use Redis Pub/Sub to broadcast messages across Gateway instances.
- Ensure state consistency for connection presence.

### Phase 4: Observability
- Implement trace context initialization for all incoming requests (sent to Tempo).
- Export metrics for connection count, message throughput, and auth failures (Prometheus).
- Implement structured logging for all proxied requests (stdout/Loki).

### Phase 5: Analytics
- Implement SESSION_STARTED and SESSION_ENDED event emission to Event Service.
- Track client types and connection durations for retention analysis.

### Phase 6: Rate Limiting & Security
- Implement per-user and per-IP rate limiting.
- Add security headers and CORS configuration.

## Success Metrics

- P99 WebSocket connection time < 500ms.
- 0% unauthenticated requests reaching backend services.
- < 100ms latency for real-time message delivery.
