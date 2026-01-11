# Implementation Plan: Play-Money Poker MVP

**Branch**: `001-poker-mvp` | **Date**: 2026-01-09 | **Spec**: /Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/spec.md
**Input**: Feature specification from `/Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Deliver a web-based, play-money Texas Hold'em MVP with server-authoritative gameplay,
real-time table updates, Keycloak-based authentication (including Google login),
and auditability via per-hand event logs. Provide a local Docker Compose stack with
observability (OTel + Grafana) and a deterministic poker engine with timer-driven
actions, reconnection, chat, and basic moderation.

## Technical Context

**Language/Version**: TypeScript (Node.js 20 LTS, React 18)
**Primary Dependencies**: React UI, Express API, Keycloak (OIDC), WebSocket
transport, OpenTelemetry SDKs, Grafana stack, Redis, Web Push, Docker Compose
**Storage**: Keycloak Postgres for auth; gameplay state in memory with optional
Redis persistence for tables, profiles, friends, and events
**Testing**: Vitest for unit/integration, React Testing Library for UI,
Playwright for smoke tests, fast-check optional for property tests
**Target Platform**: Modern browsers and Linux containers
**Project Type**: Web application (frontend + backend + shared)
**Performance Goals**: 95% of table updates observed within 1 second by seated
players
**Constraints**: Server-authoritative state, deterministic rules, no payments,
real-time updates plus push notifications, prevent hole-card leakage
**Scale/Scope**: MVP single-instance deployment, 2-9 players per table, tens of
concurrent tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Secure multi-device access plan (auth, session revocation, device linking):
  PASS - Keycloak OIDC with session controls
- Realtime state sync design using push notifications: PASS - WebSocket updates
  plus Web Push notifications for turn alerts
- Telemetry event schema and collection plan: PASS - OTel events for gameplay,
  auth, and connectivity
- Deterministic game rules approach (seeded RNG, replayability): PASS - event
  sourcing and seeded shuffle for replay
- Confirmation of no on-platform payments: PASS - play-money only

## Project Structure

### Documentation (this feature)

```text
/Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
/Users/bricerising/git/brice@github/specify-poker/
apps/
├── ui/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   └── state/
│   └── tests/
└── api/
    ├── src/
    │   ├── auth/
    │   ├── http/
    │   ├── ws/
    │   ├── engine/
    │   ├── observability/
    │   └── services/
    └── tests/

packages/
└── shared/
    ├── src/
    │   ├── types/
    │   ├── schemas/
    │   └── index.ts
    └── tests/

infra/
├── keycloak/
├── grafana/
├── otel/
└── prometheus/

docker-compose.yml
```

**Structure Decision**: Use a web app monorepo with `apps/ui`, `apps/api`, and a
shared package for domain types and validation. Infrastructure lives in `infra/`
with a single `docker-compose.yml` for local orchestration.

## Complexity Tracking

No constitution violations.

## Phase 0: Outline & Research

**Unknowns**: None. All core technology choices and constraints were specified
in the feature request.

**Research Output**: /Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/research.md

## Phase 1: Design & Contracts

**Data Model**: /Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/data-model.md  
**API Contracts**: /Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/contracts/openapi.yaml  
**WebSocket Contracts**: /Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/contracts/ws-messages.md  
**Quickstart**: /Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/quickstart.md  
**Agent Context Update**: /Users/bricerising/git/brice@github/specify-poker/AGENTS.md

## Constitution Check (Post-Design)

- Secure multi-device access plan (auth, session revocation, device linking): PASS
- Realtime state sync design using push notifications: PASS
- Telemetry event schema and collection plan: PASS
- Deterministic game rules approach (seeded RNG, replayability): PASS
- Confirmation of no on-platform payments: PASS
