# Phase 0 Research: Play-Money Poker MVP

## Decisions

### Decision: TypeScript across UI, API, and shared domain
**Rationale**: Single language reduces drift between client and server rules and
simplifies shared validation and message schemas.
**Alternatives considered**: Split language stacks for UI/API (rejected for
added coordination cost).

### Decision: React UI + Express API with WebSockets
**Rationale**: React supports rapid UI iteration and Express provides a simple
HTTP + WebSocket host for an MVP.
**Alternatives considered**: Full-stack frameworks (rejected to keep MVP modular).

### Decision: Keycloak OIDC with Google login
**Rationale**: Meets secure multi-device access and federated login needs while
centralizing session management.
**Alternatives considered**: Custom auth (rejected for security risk and time).

### Decision: WebSocket real-time state plus Web Push notifications
**Rationale**: WebSockets provide low-latency table updates while Web Push meets
push notification requirements for turn alerts on inactive tabs/devices.
**Alternatives considered**: Polling (rejected due to latency and cost).

### Decision: Event-sourced hand log for determinism and auditability
**Rationale**: Deterministic replay enables dispute review and testing.
**Alternatives considered**: Snapshot-only storage (rejected due to weak audit).

### Decision: In-memory gameplay state with optional Redis persistence + pubsub
**Rationale**: Keeps the MVP simple while allowing durability and multi-instance
fanout when Redis is configured.
**Alternatives considered**: Full relational DB for gameplay (deferred).

### Decision: OpenTelemetry end-to-end with Grafana stack
**Rationale**: Aligns with telemetry requirement and supports real-time
observability for hands, actions, and connectivity.
**Alternatives considered**: Proprietary APM (rejected for cost/lock-in).

### Decision: Local Docker Compose stack with pre-provisioned infra
**Rationale**: One-command local startup for UI, API, auth, and observability.
**Alternatives considered**: Manual service startup (rejected for dev friction).

## Best Practices and Patterns

- Use server-authoritative validation for every action and disallow client-side
  state mutation.
- Include monotonically increasing state version to handle out-of-order updates
  and request resync.
- Keep hole cards server-only; send to owner as a private payload.
- Correlate telemetry using userId, tableId, handId, and connectionId.
- Enforce rate limits for action and chat endpoints to reduce abuse.
