<!--
Sync Impact Report:
- Version change: N/A (template) -> 1.0.0
- Modified principles: N/A (template) -> Secure Multi-Device Access; Real-Time State Sync
  & Push; Telemetry & Behavioral Observability; Deterministic Game Rules; No Platform
  Payments
- Added sections: Product Constraints; Delivery & Quality Gates
- Removed sections: None
- Templates requiring updates: ✅ .specify/templates/plan-template.md; ✅ .specify/templates/spec-template.md;
  ✅ .specify/templates/tasks-template.md
- Follow-up TODOs: TODO(RATIFICATION_DATE): original adoption date unknown
-->
# Specify Poker Constitution

## Core Principles

### I. Secure Multi-Device Access
Players MUST authenticate to access games across devices. Account linking, session
management, and device revocation MUST be supported to prevent unauthorized access.
Rationale: Fair gameplay depends on trustworthy identity and secure continuity.

### II. Real-Time State Sync & Push
All game state changes MUST be synchronized in real time for every player and
delivered via push notifications. Server-authoritative state and ordered events
MUST prevent divergence across devices. Rationale: The experience is only fair
when everyone sees the same game state at the same time.

### III. Telemetry & Behavioral Observability
Telemetry MUST be collected for core user flows and game events using a defined
event schema. The system MUST minimize sensitive data while preserving analytical
value. Rationale: The product must be observable to understand real usage.

### IV. Deterministic Game Rules
Game rules MUST be deterministic: the same inputs and seeded randomness MUST
produce the same outputs across all clients. Determinism MUST be verifiable via
tests and replayable event logs. Rationale: Determinism underpins fairness.

### V. No Platform Payments
The game MUST NOT support on-platform payments or in-app purchases. Rationale:
The experience must remain payment-free and free of platform billing complexity.

## Product Constraints

- Gameplay requires authenticated access; anonymous sessions are not permitted.
- Realtime sync MUST use push notifications in addition to realtime channels.
- Telemetry events MUST be documented with ownership, purpose, and retention.
- Client behavior MUST be resilient to reconnects without state divergence.
- No payment, wallet, or checkout flows are allowed in any client.

## Delivery & Quality Gates

- Deterministic rules MUST have unit tests covering seeded scenarios.
- Sync logic MUST have integration tests for reconnects and out-of-order events.
- Telemetry MUST be validated for schema correctness before release.
- Push notification behavior MUST be verified on each supported platform.

## Governance

- This constitution supersedes other guidance when conflicts arise.
- Amendments require a documented proposal, rationale, and version bump per
  semantic versioning (MAJOR for removals or redefinitions, MINOR for additions,
  PATCH for clarifications).
- All plans, specs, and tasks MUST include a compliance check against these
  principles before implementation begins.
- Compliance reviews occur at feature planning and pre-release checkpoints.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date unknown | **Last Amended**: 2026-01-09
