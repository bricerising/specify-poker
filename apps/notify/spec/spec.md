# Feature Specification: Notify Service

**Service**: `@specify-poker/notify`
**Created**: 2026-01-12
**Status**: Implemented

## Overview

The Notify Service is responsible for delivering real-time notifications to users
outside of the active game session. This includes web push notifications for 
turn alerts, game invitations, and system-wide announcements. It manages user 
push subscriptions and coordinates with third-party push services.

## User Scenarios & Testing

### User Story 1 - Turn Alerts (Priority: P1)

As a player, I want to receive a push notification when it's my turn to act,
so I don't miss my turn if I'm not actively looking at the game.

**Why this priority**: Essential for maintaining game flow and reducing time-to-act 
for inactive players.

**Independent Test**: A player is away from the app, it becomes their turn, 
the Notify service receives a request and sends a push notification to the user's
registered device.

**Acceptance Scenarios**:

1. **Given** a user with a registered push subscription, **When** the game service
   signals it is their turn, **Then** the Notify service sends a push message.
2. **Given** a user with multiple devices, **When** a notification is triggered,
   **Then** all registered devices receive the notification.
3. **Given** an expired push subscription, **When** a notification attempt fails
   with a 410 Gone error, **Then** the service removes the invalid subscription.

---

### User Story 2 - Subscription Management (Priority: P1)

As a player, I want to enable or disable push notifications from my profile 
settings, so I can control how I receive updates.

**Why this priority**: Required for basic user experience and compliance with 
platform standards.

**Independent Test**: A user registers a new push subscription and later 
unregisters it; the service updates the store accordingly.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they grant push permissions in the UI,
   **Then** the client sends the subscription object to the Notify service for storage.
2. **Given** a user with an existing subscription, **When** they opt out,
   **Then** the Notify service deletes their subscription record.

---

## Constitution Requirements

- **Privacy**: Push notification content MUST NOT contain sensitive personal data.
- **Reliability**: Notification delivery is best-effort but MUST be logged for 
  delivery failures.
- **Subscription Lifecycle**: The service MUST automatically clean up stale or 
  invalid push subscriptions based on provider feedback.
- **Scalability**: The service MUST handle bursts of notifications when multiple 
  tables reach turn actions simultaneously.

## Requirements

### Functional Requirements

- **FR-001**: System MUST store and retrieve Web Push subscriptions for users.
- **FR-002**: System MUST send Web Push notifications using VAPID authentication.
- **FR-003**: System MUST provide a gRPC interface for other services to trigger
  notifications.
- **FR-004**: System MUST support custom payloads for different notification types 
  (turns, invites).
- **FR-005**: System MUST handle 404/410 errors from push providers by removing 
  the subscription.
- **FR-006**: System MUST allow listing all subscriptions for a specific user.
- **FR-007**: System MUST support consuming events from Event Service (e.g., `TURN_STARTED`) to trigger automated notifications.

### Non-Functional Requirements

- **NFR-001**: Notification delivery request to provider MUST be initiated within
  200ms of receiving the internal trigger.
- **NFR-002**: System MUST export OTLP traces, metrics, and logs to the observability stack.
- **NFR-003**: System MUST handle at least 500 concurrent push delivery attempts.
- **NFR-004**: System MUST maintain at least 80% unit test coverage across all core logic.
- **NFR-005**: Unit tests MUST reflect realistic consumer behavior and edge cases.

### Key Entities

- **PushSubscription**: Web Push standard subscription object (endpoint, keys).
- **NotificationRequest**: Internal request containing userId, title, body, and 
  optional action URL.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 99.9% of valid push requests are successfully handed off to 
  push providers.
- **SC-002**: Subscriptions are successfully updated/cleaned within 1 second 
  of a registration or failure event.

## Assumptions

- Clients support the Web Push API.
- VAPID keys are securely managed via environment variables or secrets manager.
- High-level notification logic (when to notify) resides in the Game or Player services.
