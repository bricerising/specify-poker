# Specification: Event Sourcing & Audit Trail

## Overview

This document defines the requirements for the Event Service, which serves as the immutable, durable record of all gameplay and significant system events.

## Event Sourcing Strategy

### Immutability
- **Append-Only**: Once an event is recorded, it MUST NOT be modified or deleted.
- **Ordered Sequence**: Events within a single hand or table MUST maintain strict chronological order.

### Dual-Layer Storage
1. **Hot Storage (Redis)**: Recent events are stored in Redis Streams for low-latency retrieval by real-time features like hand replay.
2. **Cold Storage (Postgres)**: All events are asynchronously flushed to PostgreSQL for permanent, durable retention (minimum 7 years for compliance).

## Audit & Compliance

### Hand History
The system MUST be able to reconstruct the exact state of any hand from its event log.
- **Transparency**: Players can access their own hand histories.
- **Showdowns**: At the end of a hand, all relevant hole cards and hand strengths are recorded for the audit trail.

### Privacy & Redaction
While the audit log is complete, access to it is filtered based on the requester:
- **Players**: Only see their own hole cards unless the hand reached showdown.
- **Operators**: Have full access to all events for dispute resolution and bot detection.

## Downstream Processing

The Event Service provides a foundation for other system capabilities:
- **Statistics**: The Player Service consumes hand events to update wins and losses.
- **Analytics**: The BI pipeline summarizes events into business metrics (see `specs/004-analytics-insights.md`).
- **Notifications**: The Notify Service triggers turn alerts based on `TURN_STARTED` events.

## Performance Requirements

- **Ingestion**: Event writes MUST complete within 50ms.
- **Durability**: 100% of emitted events MUST be successfully persisted.
- **Throughput**: System MUST support ingestion of 10,000 events per second.
