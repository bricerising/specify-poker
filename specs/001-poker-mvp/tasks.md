---

description: "Task list template for feature implementation"
---

# Tasks: Play-Money Poker MVP

**Input**: Design documents from `/specs/001-poker-mvp/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are required for deterministic rules, sync correctness, and telemetry validation. The user also requested tests for each slice.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `apps/api/`, `apps/ui/`, `packages/shared/`
- Paths shown below use absolute paths

## Phase 1: Setup (Shared Infrastructure) — Milestone M1

**Purpose**: Project initialization and basic structure

- [X] T001 Create monorepo scaffolding and base TS configs in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tsconfig.json, /Users/bricerising/git/brice@github/specify-poker/apps/api/tsconfig.json, /Users/bricerising/git/brice@github/specify-poker/packages/shared/tsconfig.json; Goal: workspace foundation; AC: TypeScript builds in all three packages; Tests: N/A; Obs: N/A (no runtime change)
- [X] T002 Initialize workspace scripts in /Users/bricerising/git/brice@github/specify-poker/package.json and /Users/bricerising/git/brice@github/specify-poker/tsconfig.base.json; Goal: consistent build/test commands; AC: repo-level build runs for ui/api/shared; Tests: N/A; Obs: N/A (no runtime change)
- [X] T003 [P] Configure lint/format in /Users/bricerising/git/brice@github/specify-poker/.eslintrc.cjs and /Users/bricerising/git/brice@github/specify-poker/.prettierrc; Goal: consistent style; AC: lint passes on empty project; Tests: N/A; Obs: N/A (no runtime change)
- [X] T004 [P] Scaffold Docker Compose + infra skeleton in /Users/bricerising/git/brice@github/specify-poker/docker-compose.yml and /Users/bricerising/git/brice@github/specify-poker/infra/{keycloak,otel,grafana,prometheus}/; Goal: local stack layout; AC: `docker compose config` validates; Tests: N/A; Obs: container healthchecks defined
- [X] T005 [P] Add minimal API and UI entrypoints in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/server.ts and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/main.tsx; Goal: bootable services; AC: API responds to /api/health; Tests: integration test in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/health.test.ts; Obs: log api.startup with timestamp
- [X] T006 [P] Add shared package exports in /Users/bricerising/git/brice@github/specify-poker/packages/shared/src/types/index.ts and /Users/bricerising/git/brice@github/specify-poker/packages/shared/src/schemas/index.ts; Goal: shared types entrypoint; AC: ui/api import from shared without build errors; Tests: N/A; Obs: N/A (type-only change)

---

## Phase 2: Foundational (Blocking Prerequisites) — Milestone M2

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Configure Keycloak service and realm import in /Users/bricerising/git/brice@github/specify-poker/docker-compose.yml and /Users/bricerising/git/brice@github/specify-poker/infra/keycloak/realm-export.json; Goal: auth provider ready; AC: realm `poker-local` loads on startup; Tests: compose healthcheck; Obs: Keycloak container healthcheck is green
- [X] T008 Implement API JWT auth middleware in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/middleware/auth.ts and wire into /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/router.ts; Goal: secure routes; AC: protected routes reject missing/invalid tokens; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/auth.test.ts; Obs: log auth.denied with reason
- [X] T009 Implement UI auth client and token handling in /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/services/auth.ts and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/services/apiClient.ts; Goal: authenticated UI sessions; AC: /api/me returns profile after login; Tests: e2e login in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/e2e/login.spec.ts; Obs: span ui.auth.login
- [X] T010 Implement WebSocket auth and connection registry in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/ws/server.ts and /Users/bricerising/git/brice@github/specify-poker/apps/api/src/ws/connectionRegistry.ts; Goal: secure realtime channel; AC: WS rejects invalid token; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/ws-auth.test.ts; Obs: metric poker_active_connections
- [X] T011 Define telemetry setup and event schema in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/observability/otel.ts, /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/observability/otel.ts, and /Users/bricerising/git/brice@github/specify-poker/infra/otel/collector-config.yaml; Goal: end-to-end tracing; AC: traces appear for HTTP + WS connect; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/otel-smoke.test.ts; Obs: spans api.http.request and ui.navigation exist
- [X] T012 Implement in-memory table registry + event store interface in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/services/tableRegistry.ts and /Users/bricerising/git/brice@github/specify-poker/apps/api/src/services/eventStore.ts; Goal: core state storage; AC: create/list tables and append/read events; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/unit/eventStore.test.ts; Obs: log event_store.append
- [X] T013 Implement Web Push subscription service in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/services/pushNotifications.ts and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/services/pushClient.ts; Goal: turn alerts; AC: subscription register/unregister works; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/push-subscribe.test.ts; Obs: metric poker_push_notifications_total
- [X] T014 Add shared domain schemas/types in /Users/bricerising/git/brice@github/specify-poker/packages/shared/src/schemas/ and /Users/bricerising/git/brice@github/specify-poker/packages/shared/src/types/; Goal: consistent payload validation; AC: schema validation passes for sample payloads; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/packages/shared/tests/schemas.test.ts; Obs: N/A (schema-only change)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Join & Play a Hand (Priority: P1) 🎯 MVP — Milestone M3

**Goal**: Players can join a table and complete a full hand with real-time updates.

**Independent Test**: Two users join a seeded table, play a hand through showdown, and see consistent chip updates.

### Tests for User Story 1

- [X] T015 [P] [US1] Add contract test for join/list and WS snapshot in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/contract/tables.contract.test.ts; Goal: validate REST/WS payloads; AC: contract test passes; Tests: contract; Obs: N/A (test-only)
- [X] T016 [P] [US1] Add integration test for full hand flow in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/hand-flow.test.ts; Goal: deterministic hand lifecycle; AC: scripted hand completes; Tests: integration; Obs: asserts hand_lifecycle spans exist

### Implementation for User Story 1

- [X] T017 [US1] Implement hand state machine in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/engine/handEngine.ts; Goal: deterministic street progression; AC: preflop→showdown transitions are correct; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/unit/handEngine.test.ts; Obs: span poker.hand.transition
- [X] T018 [US1] Implement hand evaluation/showdown in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/engine/handEval.ts; Goal: rank winners correctly; AC: sample hands match expected ranks; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/unit/handEval.test.ts; Obs: metric poker_hand_evaluations_total
- [X] T019 [US1] Implement betting/action rules + side pots in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/engine/actionRules.ts; Goal: legal action enforcement; AC: illegal actions rejected and side pots created; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/unit/actionRules.test.ts; Obs: metric poker_actions_total{action_type}
- [X] T020 [US1] Implement WS table rooms and snapshots in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/ws/tableHub.ts; Goal: realtime state sync; AC: subscribers receive snapshot + updates; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/ws-table.test.ts; Obs: metric poker_table_updates_total
- [X] T021 [US1] Implement table list/join/leave endpoints in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/routes/tables.ts; Goal: join seats and spectate; AC: join returns wsUrl and seat assignment; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/tables.test.ts; Obs: span poker.table.join
- [X] T022 [US1] Implement table UI page + state store in /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/pages/TablePage.tsx and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/state/tableStore.ts; Goal: render table state; AC: seats/pot/board update in realtime; Tests: component in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/components/TablePage.test.tsx; Obs: span ui.table.render
- [X] T023 [US1] Implement action bar and legal action derivation in /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/components/ActionBar.tsx and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/state/deriveLegalActions.ts; Goal: correct action controls; AC: only legal actions shown; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/unit/deriveLegalActions.test.ts; Obs: span ui.action.submit
- [X] T024 [US1] Implement turn timer + disconnect handling in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/services/turnTimer.ts and /Users/bricerising/git/brice@github/specify-poker/apps/api/src/ws/connectionManager.ts; Goal: auto-fold/check on expiry; AC: timeout triggers expected action; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/timer.test.ts; Obs: metric poker_timer_timeouts_total
- [X] T025 [US1] Wire event log + replay for audit in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/services/eventStore.ts and /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/routes/audit.ts; Goal: replayable hand logs; AC: replay rebuilds state exactly; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/unit/replay.test.ts; Obs: log hand.event_appended

**Checkpoint**: User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Create & Manage a Table (Priority: P2) — Milestone M4

**Goal**: Players can create tables, see lobby updates, and moderate chat/players.

**Independent Test**: A user creates a table, joins it, and kicks another user while lobby updates remain accurate.

### Tests for User Story 2

- [ ] T026 [P] [US2] Add contract test for create/moderation endpoints in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/contract/moderation.contract.test.ts; Goal: validate request/response schemas; AC: contract test passes; Tests: contract; Obs: N/A (test-only)
- [ ] T027 [P] [US2] Add e2e lobby flow test in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/e2e/lobby-flow.spec.ts; Goal: create table and see lobby list; AC: e2e passes; Tests: e2e; Obs: span poker.table.create present

### Implementation for User Story 2

- [ ] T028 [US2] Implement create table endpoint in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/routes/tables.ts; Goal: create tables with config; AC: tables appear in lobby list; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/create-table.test.ts; Obs: span poker.table.create
- [ ] T029 [US2] Implement lobby list UI + polling/WS refresh in /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/pages/LobbyPage.tsx and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/services/lobbyApi.ts; Goal: show current tables; AC: lobby reflects changes within 2s; Tests: component in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/components/LobbyPage.test.tsx; Obs: span ui.lobby.render
- [ ] T030 [US2] Implement create table form in /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/components/CreateTableForm.tsx; Goal: user can set blinds/max players/stack; AC: validation blocks invalid values; Tests: component in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/components/CreateTableForm.test.tsx; Obs: span ui.table.create_submit
- [ ] T031 [US2] Implement chat send/broadcast in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/ws/chatHub.ts and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/components/ChatPanel.tsx; Goal: table chat; AC: messages arrive to seated players; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/ws-chat.test.ts; Obs: metric poker_chat_messages_total
- [ ] T032 [US2] Implement moderation endpoints + UI controls in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/routes/moderation.ts and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/components/ModerationMenu.tsx; Goal: kick/mute actions; AC: owner can kick/mute successfully; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/moderation.test.ts; Obs: log moderation.action

**Checkpoint**: User Stories 1 and 2 are independently functional

---

## Phase 5: User Story 3 - Profiles & Social Context (Priority: P3) — Milestone M5

**Goal**: Players can update profiles, view stats, and manage friends.

**Independent Test**: A user updates nickname/avatar and sees stats and friends list reflected in UI.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add contract test for profile endpoints in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/contract/profile.contract.test.ts; Goal: validate profile schema; AC: contract test passes; Tests: contract; Obs: N/A (test-only)
- [ ] T034 [P] [US3] Add e2e profile update test in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/e2e/profile-flow.spec.ts; Goal: ensure profile updates in UI; AC: e2e passes; Tests: e2e; Obs: span ui.profile.save

### Implementation for User Story 3

- [ ] T035 [US3] Implement /api/me and /api/profile in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/routes/profile.ts; Goal: profile read/update; AC: nickname/avatar update persists; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/profile.test.ts; Obs: span poker.profile.update
- [ ] T036 [US3] Implement stats tracking on hand end in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/engine/statTracker.ts; Goal: track hands played and wins; AC: stats increment after hand end; Tests: unit in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/unit/statTracker.test.ts; Obs: metric poker_hands_completed_total
- [ ] T037 [US3] Implement profile UI in /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/pages/ProfilePage.tsx and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/components/ProfileForm.tsx; Goal: edit nickname/avatar; AC: UI shows updated profile; Tests: component in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/components/ProfileForm.test.tsx; Obs: span ui.profile.render
- [ ] T038 [US3] Implement friends list storage + UI in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/services/friendsService.ts and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/pages/FriendsPage.tsx; Goal: friends list persistence; AC: friends list saved and displayed; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/friends.test.ts; Obs: log friends.update

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns — Milestone M6

**Purpose**: Observability, reliability, and hardening across stories

- [ ] T039 [P] Provision Grafana datasources/dashboards in /Users/bricerising/git/brice@github/specify-poker/infra/grafana/provisioning/ and /Users/bricerising/git/brice@github/specify-poker/infra/grafana/dashboards/poker-observability.json; Goal: runtime visibility; AC: dashboard loads with metrics; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/infra/grafana/tests/dashboard.spec.ts; Obs: panels for poker_actions_total and poker_active_connections
- [ ] T040 [P] Configure OTel Collector and Prometheus scrape in /Users/bricerising/git/brice@github/specify-poker/infra/otel/collector-config.yaml and /Users/bricerising/git/brice@github/specify-poker/infra/prometheus/prometheus.yaml; Goal: metric/traces pipeline; AC: metrics appear in Prometheus; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/infra/prometheus/tests/scrape.spec.ts; Obs: metric poker_active_connections visible
- [ ] T041 [P] Add full-stack smoke test in /Users/bricerising/git/brice@github/specify-poker/apps/ui/tests/e2e/smoke.spec.ts; Goal: login, create table, join, play hand; AC: smoke test passes; Tests: e2e; Obs: trace includes hand lifecycle spans
- [ ] T042 [P] Add rate limiting and input validation in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/http/middleware/rateLimit.ts and /Users/bricerising/git/brice@github/specify-poker/apps/api/src/ws/validators.ts; Goal: abuse prevention; AC: excessive requests rejected; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/rate-limit.test.ts; Obs: metric poker_rate_limited_total
- [ ] T043 [P] Harden resync/version mismatch handling in /Users/bricerising/git/brice@github/specify-poker/apps/api/src/ws/tableHub.ts and /Users/bricerising/git/brice@github/specify-poker/apps/ui/src/services/wsClient.ts; Goal: recover from out-of-order updates; AC: client resyncs on version gap; Tests: integration in /Users/bricerising/git/brice@github/specify-poker/apps/api/tests/integration/ws-resync.test.ts; Obs: metric poker_resync_total
- [ ] T044 [P] Update quickstart for auth + dashboards in /Users/bricerising/git/brice@github/specify-poker/specs/001-poker-mvp/quickstart.md; Goal: accurate onboarding; AC: quickstart covers Keycloak and Grafana steps; Tests: N/A; Obs: N/A (documentation only)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (M1)**: No dependencies - can start immediately
- **Foundational (M2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (M3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (M6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (M2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (M2) - Integrates with US1 but independently testable
- **User Story 3 (P3)**: Can start after Foundational (M2) - Independent from US1/US2

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- Tasks marked [P] can run in parallel (different files, no dependencies)
- Once Foundational (M2) completes, User Stories can proceed in parallel if desired

---

## Parallel Examples

### User Story 1

```bash
Task: "Contract test for join/list and WS snapshot"
Task: "Integration test for full hand flow"
Task: "Hand evaluation/showdown implementation"
```

### User Story 2

```bash
Task: "Lobby page UI"
Task: "Create table form"
Task: "Chat send/broadcast"
```

### User Story 3

```bash
Task: "Profile endpoints"
Task: "Profile UI"
Task: "Friends list storage + UI"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (M1)
2. Complete Phase 2: Foundational (M2)
3. Complete Phase 3: User Story 1 (M3)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Demo MVP gameplay

### Incremental Delivery

1. Complete M1 + M2 → foundation ready
2. Deliver M3 → validate gameplay + realtime sync
3. Deliver M4 → add lobby management + moderation
4. Deliver M5 → add profiles and social context
5. Deliver M6 → observability + hardening
