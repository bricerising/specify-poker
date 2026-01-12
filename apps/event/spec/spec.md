# Feature Specification: Event Service

**Service**: `@specify-poker/event`
**Created**: 2026-01-12
**Status**: Planned

## Overview

The Event Service provides append-only event storage, hand history persistence, and replay
capabilities. It serves as the audit trail and historical record for all gameplay events,
supporting regulatory compliance, player hand history access, and game analytics.

## User Scenarios & Testing

### User Story 1 - Hand History (Priority: P1)

As a player, I can view the history of hands I've played including all actions and
outcomes.

**Why this priority**: Hand history is essential for player trust and regulatory
compliance; players need to verify game fairness.

**Independent Test**: A user plays a hand, then navigates to hand history and sees
complete action-by-action replay of the hand.

**Acceptance Scenarios**:

1. **Given** a completed hand, **When** a participant requests hand history, **Then**
   they see all actions, community cards, and showdown results.
2. **Given** a player at a table, **When** they request recent hands, **Then** they
   see the last N hands they participated in.
3. **Given** a hand in progress, **When** hand history is requested, **Then** only
   completed hands are returned.

---

### User Story 2 - Event Audit Trail (Priority: P1)

As an operator, I can query all events for a table or user for compliance and
dispute resolution.

**Why this priority**: Audit trail is a regulatory requirement for gaming operations
and essential for dispute resolution.

**Independent Test**: An operator queries events for a specific table and receives
a complete chronological log of all actions.

**Acceptance Scenarios**:

1. **Given** events for a table, **When** an operator queries by table ID, **Then**
   all events are returned in chronological order.
2. **Given** events for a user, **When** an operator queries by user ID, **Then**
   all events involving that user are returned.
3. **Given** a time range, **When** events are queried with time bounds, **Then**
   only events within that range are returned.

---

### User Story 3 - Hand Replay (Priority: P2)

As a player, I can replay a hand step-by-step to review the action.

**Why this priority**: Replay enhances player experience and learning but is not
required for core gameplay.

**Independent Test**: A player selects a completed hand and steps through each
action seeing the table state at each point.

**Acceptance Scenarios**:

1. **Given** a hand history, **When** a player requests replay, **Then** they
   receive ordered state snapshots for each action.
2. **Given** a replay in progress, **When** the player steps forward, **Then**
   they see the next action applied.
3. **Given** a replay, **When** hole cards are shown, **Then** only the requesting
   player's cards are revealed (unless showdown).

---

### User Story 4 - Event Streaming (Priority: P2)

As a downstream service, I can subscribe to event streams for real-time processing.

**Why this priority**: Streaming enables real-time analytics and other services to
react to game events.

**Independent Test**: A subscriber connects to a table's event stream and receives
events in real-time as actions occur.

**Acceptance Scenarios**:

1. **Given** a subscriber to a table stream, **When** an action occurs, **Then**
   the event is delivered within 100ms.
2. **Given** a subscriber with a cursor, **When** they reconnect, **Then** they
   receive events from their last position.
3. **Given** multiple subscribers, **When** an event is published, **Then** all
   subscribers receive it independently.

---

### Edge Cases

- Event storage fails mid-hand (must not lose events).
- Large hand history query exceeds memory limits.
- Subscriber falls behind and misses events.
- Concurrent writes to same event stream.
- Clock skew between services affects ordering.
- Hand replay requested for hand still in progress.

## Constitution Requirements

- **Immutability**: Events MUST be append-only and immutable once written.
- **Ordering**: Events MUST maintain strict chronological ordering within a hand.
- **Durability**: Events MUST survive service restarts and be recoverable.
- **Privacy**: Hand history MUST only be accessible to participants and authorized
  operators.
- **Retention**: Events MUST be retained for regulatory compliance period (varies
  by jurisdiction, default 7 years).

## Requirements

### Functional Requirements

- **FR-001**: System MUST persist all game events (actions, showdowns, settlements).
- **FR-002**: System MUST maintain event ordering within a hand.
- **FR-003**: System MUST support querying events by table ID.
- **FR-004**: System MUST support querying events by user ID.
- **FR-005**: System MUST support querying events by time range.
- **FR-006**: System MUST support pagination for large result sets.
- **FR-007**: System MUST provide hand history for completed hands.
- **FR-008**: System MUST support hand replay with state reconstruction.
- **FR-009**: System MUST provide real-time event streaming.
- **FR-010**: System MUST support cursor-based stream resumption.
- **FR-011**: System MUST expose gRPC API for internal service communication.
- **FR-012**: System MUST redact private information based on requester identity.

### Non-Functional Requirements

- **NFR-001**: Event writes MUST complete within 50ms.
- **NFR-002**: Event queries MUST complete within 200ms (first page).
- **NFR-003**: Service MUST support 10,000 events per second write throughput.
- **NFR-004**: Event stream latency MUST be under 100ms.
- **NFR-005**: System MUST maintain at least 80% unit test coverage across all core logic.
- **NFR-006**: Unit tests MUST reflect realistic consumer behavior and edge cases.

### Key Entities

- **GameEvent**: Individual game event with type, payload, and metadata.
- **HandRecord**: Aggregated record of a complete hand.
- **EventStream**: Ordered sequence of events for a context (table/hand).
- **Cursor**: Position marker for stream consumption.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of events persisted with no data loss.
- **SC-002**: 99.9% of event queries return within 500ms.
- **SC-003**: Hand history available within 5 seconds of hand completion.
- **SC-004**: Event stream lag under 200ms at p99.

## Assumptions

- Events are published by Game Service via gRPC.
- Event storage uses PostgreSQL for durability with Redis for hot streams.
- Hand records are materialized from events after hand completion.
- Replay state is reconstructed from events, not stored separately.
- Stream subscriptions are managed via gRPC streaming.
