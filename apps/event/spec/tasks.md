# Tasks: Event Service

## Phase 1: Service Scaffolding

### T001: Initialize event service package
- **File**: `package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: typescript, @grpc/grpc-js, pg, redis

### T002: Configure TypeScript
- **File**: `tsconfig.json`
- **Acceptance**: Matches project configuration, strict mode enabled

### T003: Create server entry point
- **File**: `src/server.ts`
- **Acceptance**: gRPC server starts on port 50054

### T004: Add configuration management
- **File**: `src/config.ts`
- **Acceptance**: Environment variables loaded with defaults

### T005: Create Dockerfile
- **File**: `Dockerfile`
- **Acceptance**: `docker build` succeeds, container runs

---

## Phase 2: Database Setup

### T006: Create database migrations
- **File**: `migrations/001_initial.sql`
- **Acceptance**: Tables created: events, hand_records, cursors

### T007: Implement database client
- **File**: `src/storage/db.ts`
- **Functions**: query, transaction, getPool
- **Acceptance**: Connection pool established, queries work

### T008: Implement Redis client
- **File**: `src/storage/redisClient.ts`
- **Acceptance**: Connection established, graceful fallback

---

## Phase 3: Storage Layer

### T009: Implement event store
- **File**: `src/storage/eventStore.ts`
- **Functions**: insert, insertBatch, findByHand, findByTable, findByUser
- **Acceptance**: Events persisted to PostgreSQL with partitioning

### T010: Implement hand record store
- **File**: `src/storage/handRecordStore.ts`
- **Functions**: save, findById, findByTable, findByUser
- **Acceptance**: Hand records persisted and queryable

### T011: Implement cursor store
- **File**: `src/storage/cursorStore.ts`
- **Functions**: get, upsert, delete, findBySubscriber
- **Acceptance**: Cursors persisted with Redis caching

### T012: Implement stream store
- **File**: `src/storage/streamStore.ts`
- **Functions**: publish, subscribe, getLatest, trim
- **Acceptance**: Redis Streams working for real-time delivery

---

## Phase 4: Domain Types

### T013: Define event types
- **File**: `src/domain/types.ts`
- **Acceptance**: All event types and payloads defined

### T014: Define query types
- **File**: `src/domain/queries.ts`
- **Acceptance**: Query, pagination, and result types defined

### T015: Define stream types
- **File**: `src/domain/streams.ts`
- **Acceptance**: Stream and cursor types defined

---

## Phase 5: Services

### T016: Implement event ingestion service
- **File**: `src/services/eventIngestionService.ts`
- **Functions**: publishEvent, publishEvents, validateEvent
- **Acceptance**: Events validated, stored, and streamed

### T017: Implement event query service
- **File**: `src/services/eventQueryService.ts`
- **Functions**: queryEvents, getEvent, countEvents
- **Acceptance**: Efficient queries with pagination

### T018: Implement hand record service
- **File**: `src/services/handRecordService.ts`
- **Functions**: materializeHand, getHandRecord, getHandHistory
- **Acceptance**: Hand records materialized from events

### T019: Implement replay service
- **File**: `src/services/replayService.ts`
- **Functions**: getReplayStates, reconstructState
- **Acceptance**: Step-by-step state reconstruction

### T020: Implement stream service
- **File**: `src/services/streamService.ts`
- **Functions**: subscribe, unsubscribe, getCursor, updateCursor
- **Acceptance**: Real-time streaming with cursor management

### T021: Implement privacy service
- **File**: `src/services/privacyService.ts`
- **Functions**: filterEvent, filterHandRecord, canAccess
- **Acceptance**: Hole cards redacted based on viewer

---

## Phase 6: gRPC API

### T022: Create proto definitions
- **File**: `proto/event.proto`
- **Acceptance**: All service methods defined

### T023: Implement gRPC server
- **File**: `src/grpc/server.ts`
- **Acceptance**: Proto loaded, server listening

### T024: Implement event handlers
- **File**: `src/grpc/handlers/events.ts`
- **Acceptance**: PublishEvent, PublishEvents, QueryEvents, GetEvent

### T025: Implement hand history handlers
- **File**: `src/grpc/handlers/handHistory.ts`
- **Acceptance**: GetHandRecord, GetHandHistory, GetHandsForUser

### T026: Implement replay handlers
- **File**: `src/grpc/handlers/replay.ts`
- **Acceptance**: GetHandReplay with state snapshots

### T027: Implement streaming handlers
- **File**: `src/grpc/handlers/streaming.ts`
- **Acceptance**: SubscribeToStream, GetCursor, UpdateCursor

---

## Phase 7: Background Jobs

### T028: Implement hand materializer
- **File**: `src/jobs/handMaterializer.ts`
- **Acceptance**: Hand records created on HAND_COMPLETED event

### T029: Implement stream trimmer
- **File**: `src/jobs/streamTrimmer.ts`
- **Acceptance**: Old events trimmed from Redis Streams

### T030: Implement partition manager
- **File**: `src/jobs/partitionManager.ts`
- **Acceptance**: Monthly partitions created ahead of time

### T031: Implement archiver
- **File**: `src/jobs/archiver.ts`
- **Acceptance**: Old events moved to cold storage

---

## Phase 8: Observability

### T032: Add structured logging
- **File**: `src/observability/logger.ts`
- **Acceptance**: JSON logs with correlation IDs

### T033: Add metrics
- **File**: `src/observability/metrics.ts`
- **Acceptance**: Event throughput, latency, stream lag metrics

### T034: Add tracing
- **File**: `src/observability/tracing.ts`
- **Acceptance**: OpenTelemetry spans for all operations

---

## Phase 9: Testing

### T035: Unit tests for event ingestion
- **File**: `tests/unit/eventIngestionService.test.ts`
- **Coverage**: Validation, storage, streaming

### T036: Unit tests for event queries
- **File**: `tests/unit/eventQueryService.test.ts`
- **Coverage**: Filters, pagination, cursors

### T037: Unit tests for hand records
- **File**: `tests/unit/handRecordService.test.ts`
- **Coverage**: Materialization, privacy filtering

### T038: Unit tests for replay
- **File**: `tests/unit/replayService.test.ts`
- **Coverage**: State reconstruction accuracy

### T039: Integration tests for database
- **File**: `tests/integration/database.test.ts`
- **Coverage**: Event and hand record persistence

### T040: Integration tests for streaming
- **File**: `tests/integration/streaming.test.ts`
- **Coverage**: Pub/sub, cursor resumption

### T041: Integration tests for gRPC API
- **File**: `tests/integration/grpc.test.ts`
- **Coverage**: All service methods

---

## Task Dependencies

```
T001 -> T002 -> T003 -> T004 -> T005
                  |
                  v
        T006 -> T007 -> T008
                  |
                  v
        T009 -> T010 -> T011 -> T012
                  |
                  v
        T013 -> T014 -> T015
                  |
                  v
        T016 -> T017 -> T018 -> T019 -> T020 -> T021
                  |
                  v
        T022 -> T023 -> T024 -> T025 -> T026 -> T027
                  |
                  v
        T028 -> T029 -> T030 -> T031
                  |
                  v
            T032 -> T033 -> T034
                  |
                  v
T035 -> T036 -> T037 -> T038 -> T039 -> T040 -> T041
```

## Migration Notes

### New Service (No Migration)

The Event Service is a new service with no existing code to migrate. However, it
will need to integrate with the Game Service to receive events.

### Integration Points

1. **Game Service**: Publishes events via gRPC after each action.
2. **Player Service**: Queries hand history for player profiles.
3. **Gateway**: Streams events to connected clients for spectating.
4. **Notify Service**: Subscribes to specific event types for notifications.

### Event Publishing Pattern

Game Service should publish events after state changes:

```typescript
// In Game Service handEngine.ts
async function applyAction(state: TableState, action: Action): Promise<TableState> {
  const newState = engine.applyAction(state, action);

  // Publish event to Event Service
  await eventClient.publishEvent({
    type: "ACTION_TAKEN",
    tableId: state.tableId,
    handId: state.hand.handId,
    userId: action.userId,
    seatId: action.seatId,
    payload: {
      action: action.type,
      amount: action.amount,
      isAllIn: newState.seats[action.seatId].stack === 0
    }
  });

  return newState;
}
```

### Key Differences from Current API

1. **Dedicated storage**: PostgreSQL with partitioning for long-term retention.
2. **Real-time streaming**: Redis Streams for efficient pub/sub.
3. **Materialized views**: Hand records computed from events.
4. **Privacy-aware**: Automatic hole card redaction based on viewer.
