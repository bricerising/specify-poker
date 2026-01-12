# Tasks: Player Service

## Phase 1: Service Scaffolding

### T001: Initialize player service package
- **File**: `package.json`
- **Acceptance**: `npm install` succeeds, TypeScript compiles
- **Dependencies**: typescript, @grpc/grpc-js, pg, redis

### T002: Configure TypeScript
- **File**: `tsconfig.json`
- **Acceptance**: Matches project configuration, strict mode enabled

### T003: Create server entry point
- **File**: `src/server.ts`
- **Acceptance**: gRPC server starts on port 50052

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
- **Acceptance**: Tables created: profiles, statistics, friends

### T007: Implement database client
- **File**: `src/storage/db.ts`
- **Functions**: query, transaction
- **Acceptance**: Connection pool established, queries work

### T008: Implement Redis client
- **File**: `src/storage/redisClient.ts`
- **Acceptance**: Connection established, graceful fallback

---

## Phase 3: Storage Layer

### T009: Implement profile repository
- **File**: `src/storage/profileRepository.ts`
- **Functions**: findById, findByNickname, save, update, delete
- **Acceptance**: CRUD operations work with PostgreSQL

### T010: Implement statistics repository
- **File**: `src/storage/statisticsRepository.ts`
- **Functions**: findById, increment, update
- **Acceptance**: Statistics persisted to PostgreSQL

### T011: Implement friends repository
- **File**: `src/storage/friendsRepository.ts`
- **Functions**: getFriends, addFriend, removeFriend
- **Acceptance**: Friend relationships managed

### T012: Implement profile cache
- **File**: `src/storage/profileCache.ts`
- **Functions**: get, set, invalidate, getMulti
- **Acceptance**: Redis cache with TTL

---

## Phase 4: Domain Types

### T013: Define domain types
- **File**: `src/domain/types.ts`
- **Acceptance**: Profile, Statistics, FriendsList defined

### T014: Define default values
- **File**: `src/domain/defaults.ts`
- **Acceptance**: Default profile, preferences, nickname generator

---

## Phase 5: Services

### T015: Implement profile service
- **File**: `src/services/profileService.ts`
- **Functions**: getProfile, getProfiles, updateProfile, deleteProfile
- **Acceptance**: Auto-create on first access, cache-aside pattern

### T016: Implement statistics service
- **File**: `src/services/statisticsService.ts`
- **Functions**: getStatistics, incrementHandsPlayed, incrementWins
- **Acceptance**: Batch updates, accurate counts

### T017: Implement friends service
- **File**: `src/services/friendsService.ts`
- **Functions**: getFriends, addFriend, removeFriend
- **Acceptance**: Friend profiles returned with nicknames

### T018: Implement deletion service
- **File**: `src/services/deletionService.ts`
- **Functions**: requestDeletion, anonymizeProfile, hardDelete
- **Acceptance**: GDPR-compliant deletion flow

### T019: Implement nickname service
- **File**: `src/services/nicknameService.ts`
- **Functions**: generateNickname, validateNickname, isAvailable
- **Acceptance**: Unique nicknames generated, validation works

---

## Phase 6: gRPC API

### T020: Create proto definitions
- **File**: `proto/player.proto`
- **Acceptance**: All service methods defined

### T021: Implement gRPC server
- **File**: `src/grpc/server.ts`
- **Acceptance**: Proto loaded, server listening

### T022: Implement profile handlers
- **File**: `src/grpc/handlers/profiles.ts`
- **Acceptance**: GetProfile, GetProfiles, UpdateProfile, DeleteProfile

### T023: Implement statistics handlers
- **File**: `src/grpc/handlers/statistics.ts`
- **Acceptance**: GetStatistics, IncrementStatistic

### T024: Implement friends handlers
- **File**: `src/grpc/handlers/friends.ts`
- **Acceptance**: GetFriends, AddFriend, RemoveFriend

### T025: Implement batch handlers
- **File**: `src/grpc/handlers/batch.ts`
- **Acceptance**: GetNicknames for efficient lookups

---

## Phase 7: Background Jobs

### T026: Implement statistics aggregator
- **File**: `src/jobs/statisticsAggregator.ts`
- **Acceptance**: Processes events from Event Service

### T027: Implement deletion processor
- **File**: `src/jobs/deletionProcessor.ts`
- **Acceptance**: Hard deletes profiles after 30-day grace

### T028: Implement cache warmer
- **File**: `src/jobs/cacheWarmer.ts`
- **Acceptance**: Pre-loads frequently accessed profiles

---

## Phase 8: Event Integration

### T029: Implement event consumer
- **File**: `src/events/consumer.ts`
- **Functions**: subscribeToHandEvents, processHandCompleted
- **Acceptance**: Statistics updated from game events

---

## Phase 9: Observability

### T030: Implement structured logging
- **File**: `src/observability/logger.ts`
- **Acceptance**: JSON logs with trace and span IDs in context written to stdout for Loki
- **Dependencies**: pino or winston

### T031: Implement distributed tracing
- **File**: `src/observability/otel.ts`
- **Acceptance**: instrumentation for gRPC and pg, sent to Tempo
- **Dependencies**: @opentelemetry/sdk-node, @opentelemetry/instrumentation-grpc, @opentelemetry/instrumentation-pg

### T032: Implement Prometheus metrics
- **File**: `src/observability/metrics.ts`
- **Acceptance**: Metrics for profile lookups, update frequency, and DB performance
- **Dependencies**: prom-client

---

## Phase 10: Testing

### T033: Unit tests for profile service
- **File**: `tests/unit/profileService.test.ts`
- **Coverage**: CRUD, auto-create, validation

### T034: Unit tests for statistics service
- **File**: `tests/unit/statisticsService.test.ts`
- **Coverage**: Increment, batch update

### T035: Unit tests for friends service
- **File**: `tests/unit/friendsService.test.ts`
- **Coverage**: Add, remove, list with profiles

### T036: Unit tests for deletion service
- **File**: `tests/unit/deletionService.test.ts`
- **Coverage**: Soft delete, anonymization, hard delete

### T037: Integration tests for database
- **File**: `tests/integration/database.test.ts`
- **Coverage**: Repository operations

### T038: Integration tests for gRPC API
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
            T013 -> T014
                  |
                  v
        T015 -> T016 -> T017 -> T018 -> T019
                  |
                  v
        T020 -> T021 -> T022 -> T023 -> T024 -> T025
                  |
                  v
            T026 -> T027 -> T028
                  |
                  v
                T029
                  |
                  v
        T030 -> T031 -> T032
                  |
                  v
T033 -> T034 -> T035 -> T036 -> T037 -> T038
```

## Migration Notes

### Files to Extract from apps/api

- `src/services/profileService.ts` -> Player profile service
- `src/services/friendsService.ts` -> Player friends service
- `src/http/routes/profile.ts` -> Reference for API contract
- `src/http/routes/friends.ts` -> Reference for API contract

### Key Differences from Current API

1. **PostgreSQL storage**: Persistent database instead of Redis-only.
2. **gRPC-only**: No HTTP API, accessed via Gateway.
3. **Event-driven stats**: Statistics updated from Event Service.
4. **GDPR compliance**: Full deletion workflow implemented.
