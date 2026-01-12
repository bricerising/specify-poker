# Implementation Plan: Notify Service

## Overview

This document outlines the implementation plan for the notify service microservice.
The service handles user push subscriptions and delivers web push notifications.

## Architecture

```
┌─────────────────────┐         gRPC          ┌─────────────────────┐
│   Game/Player Service│◄─────────────────────►│  Notify Service     │
│                     │                       │  (apps/notify)      │
│                     │                       │   gRPC: 50055       │
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
apps/notify/
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
│   │       └── handlers.ts
│   ├── domain/
│   │   └── types.ts          # Domain types
│   ├── services/
│   │   ├── subscriptionService.ts
│   │   └── pushSenderService.ts
│   ├── storage/
│   │   ├── redisClient.ts
│   │   └── subscriptionStore.ts
│   └── observability/
│       ├── logger.ts
│       └── metrics.ts
└── tests/
    ├── unit/
    └── integration/
```

## Implementation Phases

### Phase 1: Service Scaffolding
- Initialize Node.js project with TypeScript.
- Set up gRPC server for internal API.
- Add health check endpoints.

### Phase 2: Storage Layer
- Implement Redis client.
- Implement subscription store for Web Push tokens.

### Phase 3: Domain & Services
- Define domain types for PushSubscription and NotificationPayload.
- Implement subscription service (register/unregister).
- Implement push sender service using `web-push` library.

### Phase 4: Integration
- Define `notify.proto` for gRPC communication.
- Implement gRPC handlers.
- Integrate with Game and Player services for turn alerts and profile updates.

### Phase 5: Observability
- Implement structured logging with trace propagation (stdout/Loki).
- Export metrics for notification volume, provider success/failure rates.
- Instrument gRPC and Web-Push calls with OpenTelemetry (Tempo).

## Success Metrics

- P99 latency < 200ms for push hand-off to provider.
- 0% lost subscriptions on service restart.
- Successful VAPID authentication for all notifications.
