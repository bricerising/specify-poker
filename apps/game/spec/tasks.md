# Tasks: Game Service

## Phase 1: Service Scaffolding

### T001: Initialize game service package
- **File**: `package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: typescript, @grpc/grpc-js, redis

### T002: Configure TypeScript
- **File**: `tsconfig.json`
- **Acceptance**: Matches project configuration, strict mode enabled

### T003: Create server entry point
- **File**: `src/server.ts`
- **Acceptance**: gRPC server starts on port 50053

### T004: Add configuration management
- **File**: `src/config.ts`
- **Acceptance**: Environment variables loaded with defaults

### T005: Create Dockerfile
- **File**: `Dockerfile`
- **Acceptance**: `docker build` succeeds, container runs

---

## Phase 2: Storage Layer

### T006: Implement Redis client
- **File**: `src/storage/redisClient.ts`
- **Acceptance**: Connection established, graceful fallback

### T007: Implement table store
- **File**: `src/storage/tableStore.ts`
- **Functions**: save, get, delete, list, getByOwner
- **Acceptance**: CRUD operations work, lobby cache maintained

### T008: Implement table state store
- **File**: `src/storage/tableStateStore.ts`
- **Functions**: save, get, update, lock, unlock
- **Acceptance**: Optimistic locking works, distributed lock available

### T009: Implement mute store
- **File**: `src/storage/muteStore.ts`
- **Functions**: mute, unmute, isMuted, getMuted
- **Acceptance**: Per-table mute lists managed

---

## Phase 3: Domain Types

### T010: Define domain types
- **File**: `src/domain/types.ts`
- **Acceptance**: All entities from data-model.md defined

### T011: Define action types and validation
- **File**: `src/domain/actions.ts`
- **Acceptance**: Action type enums and input validation

### T012: Define event types for Event Service
- **File**: `src/domain/events.ts`
- **Acceptance**: All game events defined for emission

---

## Phase 4: Game Engine (Pure Functions)

### T013: Implement deck operations
- **File**: `src/engine/deck.ts`
- **Functions**: createDeck, shuffle, deal
- **Acceptance**: Deterministic shuffle with seed, fair dealing

### T014: Implement hand evaluation
- **File**: `src/engine/handEval.ts`
- **Functions**: evaluateHand, compareHands, getHandRank
- **Acceptance**: All hand types correctly ranked

### T015: Implement action validation
- **File**: `src/engine/actionRules.ts`
- **Functions**: validateAction, getLegalActions, getMinBet, getMaxBet
- **Acceptance**: All Texas Hold'em rules enforced

### T016: Implement pot calculation
- **File**: `src/engine/potCalculator.ts`
- **Functions**: calculatePots, calculateSidePots, splitPot
- **Acceptance**: Complex side pot scenarios handled

### T017: Implement state transitions
- **File**: `src/engine/stateTransitions.ts`
- **Functions**: applyAction, advanceStreet, startHand, endHand
- **Acceptance**: Deterministic state machine

---

## Phase 5: Services

### T018: Implement table service
- **File**: `src/services/tableService.ts`
- **Functions**: createTable, getTable, listTables, deleteTable
- **Acceptance**: Full table lifecycle management

### T019: Implement seat service
- **File**: `src/services/seatService.ts`
- **Functions**: joinSeat, leaveSeat, sitOut, sitIn
- **Acceptance**: Two-phase buy-in with Balance Service

### T020: Implement hand service
- **File**: `src/services/handService.ts`
- **Functions**: startHand, processAction, endHand
- **Acceptance**: Full hand lifecycle with events

### T021: Implement moderation service
- **File**: `src/services/moderationService.ts`
- **Functions**: kick, mute, unmute, isMuted
- **Acceptance**: Owner-only operations enforced

### T022: Implement timer service
- **File**: `src/services/timerService.ts`
- **Functions**: startTimer, cancelTimer, onTimeout
- **Acceptance**: Turn timers trigger auto-fold

---

## Phase 6: External Integrations

### T023: Implement Balance Service client
- **File**: `src/clients/balanceClient.ts`
- **Functions**: reserve, commit, release, settle
- **Acceptance**: gRPC calls with fallback

### T024: Implement Event Service client
- **File**: `src/clients/eventClient.ts`
- **Functions**: emitEvent, emitBatch
- **Acceptance**: Async event emission

### T025: Implement pub/sub publisher
- **File**: `src/pubsub/publisher.ts`
- **Functions**: publishTableUpdate, publishLobbyUpdate
- **Acceptance**: Gateway receives updates

---

## Phase 7: gRPC API

### T026: Create proto definitions
- **File**: `proto/game.proto`
- **Acceptance**: All service methods defined

### T027: Implement gRPC server
- **File**: `src/grpc/server.ts`
- **Acceptance**: Proto loaded, server listening

### T028: Implement table handlers
- **File**: `src/grpc/handlers/tables.ts`
- **Acceptance**: CreateTable, GetTable, ListTables, DeleteTable

### T029: Implement seat handlers
- **File**: `src/grpc/handlers/seats.ts`
- **Acceptance**: JoinSeat, LeaveSeat, GetTableState

### T030: Implement action handlers
- **File**: `src/grpc/handlers/actions.ts`
- **Acceptance**: SubmitAction with validation

### T031: Implement moderation handlers
- **File**: `src/grpc/handlers/moderation.ts`
- **Acceptance**: Kick, Mute, Unmute, IsMuted

---

## Phase 8: Background Jobs

### T032: Implement hand starter
- **File**: `src/jobs/handStarter.ts`
- **Acceptance**: Auto-start hands when conditions met

### T033: Implement disconnection handler
- **File**: `src/jobs/disconnectionHandler.ts`
- **Acceptance**: Mark seats disconnected, auto-fold on timeout

---

## Phase 9: Observability

### T034: Implement structured logging
- **File**: `src/observability/logger.ts`
- **Acceptance**: JSON logs with trace and span IDs in context written to stdout for Loki
- **Dependencies**: pino or winston

### T035: Implement distributed tracing
- **File**: `src/observability/otel.ts`
- **Acceptance**: gRPC instrumentation and span propagation
- **Dependencies**: @opentelemetry/sdk-node, @opentelemetry/instrumentation-grpc

### T036: Implement Prometheus metrics
- **File**: `src/observability/metrics.ts`
- **Acceptance**: Metrics for turn timers, hand outcomes, and gRPC performance
- **Dependencies**: prom-client

---

## Phase 10: Analytics

### T037: Implement turn timing tracking
- **File**: `src/engine/stateTransitions.ts`
- **Acceptance**: Record duration between TURN_STARTED and ACTION_TAKEN
- **Metadata**: Labeled by street (preflop, flop, etc.) and action type

---

## Phase 11: Testing

### T038: Unit tests for hand evaluation
- **File**: `tests/unit/handEval.test.ts`
- **Coverage**: All hand types, ties, kickers

### T039: Unit tests for action validation
- **File**: `tests/unit/actionRules.test.ts`
- **Coverage**: All action types, edge cases

### T040: Unit tests for pot calculation
- **File**: `tests/unit/potCalculator.test.ts`
- **Coverage**: Simple pots, side pots, splits

### T041: Unit tests for state transitions
- **File**: `tests/unit/stateTransitions.test.ts`
- **Coverage**: All streets, all action types

### T042: Integration tests for table lifecycle
- **File**: `tests/integration/tables.test.ts`
- **Coverage**: Create, join, leave, delete

### T043: Integration tests for hand flow
- **File**: `tests/integration/hands.test.ts`
- **Coverage**: Complete hands, showdowns, all-ins

### T044: Integration tests for gRPC API
- **File**: `tests/integration/grpc.test.ts`
- **Coverage**: All service methods

---

## Task Dependencies

```
T001 -> T002 -> T003 -> T004 -> T005
                  |
                  v
        T006 -> T007 -> T008 -> T009
                  |
                  v
        T010 -> T011 -> T012
                  |
                  v
        T013 -> T014 -> T015 -> T016 -> T017
                  |
                  v
        T018 -> T019 -> T020 -> T021 -> T022
                  |
                  v
        T023 -> T024 -> T025
                  |
                  v
        T026 -> T027 -> T028 -> T029 -> T030 -> T031
                  |
                  v
              T032 -> T033
                  |
                  v
        T034 -> T035 -> T036
                  |
                  v
                T037
                  |
                  v
T038 -> T039 -> T040 -> T041 -> T042 -> T043 -> T044
```

## Migration Notes

### Files to Extract from apps/api

- `src/engine/handEngine.ts` -> Game engine core
- `src/engine/handEval.ts` -> Game hand evaluation
- `src/engine/actionRules.ts` -> Game action validation
- `src/engine/types.ts` -> Game domain types
- `src/services/tableService.ts` -> Game table service
- `src/services/tableState.ts` -> Game table state store
- `src/services/tableRegistry.ts` -> Game table store
- `src/services/moderationService.ts` -> Game moderation service
- `src/clients/balanceClient.ts` -> Game balance client (copy)

### Key Differences from Current API

1. **No HTTP API**: Game Service is gRPC-only, accessed via Gateway.
2. **No WebSocket**: Gateway handles all client connections.
3. **Event emission**: Events sent to Event Service, not stored locally.
4. **Pub/sub publishing**: Updates published for Gateway to broadcast.
