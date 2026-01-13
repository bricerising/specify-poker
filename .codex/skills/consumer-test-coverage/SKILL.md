---
name: consumer-test-coverage
description: Create or expand consumer-centric test suites and coverage for microservices (gRPC/HTTP handlers, service flows, event consumers, caches, jobs, observability) while preserving behavior and hitting coverage targets. Use when asked to add tests, raise coverage, or validate consumer-facing behavior across services.
---

# Consumer Test Coverage

## Overview

Improve coverage by exercising consumer-visible behavior with infra mocked, while preserving API behavior and meeting coverage targets for the scoped service.

## Workflow

1. Read the relevant specs for the target service and map them to consumer-facing flows.
2. Identify consumer-facing entrypoints: gRPC/HTTP handlers, public service methods, event consumers, pub/sub outputs.
3. Add tests for success and failure paths that validate API outputs, state changes, and emitted events.
4. Mock infra boundaries (DB, Redis, gRPC clients, timers, network listeners) to avoid real I/O.
5. Avoid real servers; use handler calls or stubbed `http.createServer` and fake timers.
6. Use `vi.hoisted` when mocked values are referenced by `vi.mock` factories.
7. Run scoped coverage for the service and iterate until coverage target is met (default 80% unless specs say otherwise).
8. When asked to run full test or lint suites, defer to the `run-tests-lint` skill workflow.

## Testing Patterns

- Handler paths: call handlers directly with mocked dependencies; assert responses and error mapping.
- Service flows: exercise joins/leaves/actions and edge cases with deterministic state.
- Event consumers: feed mixed payload shapes (missing type, struct/list values, invalid entries).
- Cache/storage: cover cache hit/miss, null/empty results, invalidation behavior.
- Jobs/timers: use fake timers; cover interval runs and error logging branches.
- Observability: assert metrics render and logging mixins without external services.

## Guardrails

- Preserve externally visible behavior and API shapes.
- Avoid real network/listen calls in unit tests; mock them.
- Keep tests consumer-focused; avoid asserting internal implementation details beyond outputs/side effects.

## Commands

- `npx vitest run apps/<service>/**/*.test.ts --coverage --coverage.include='apps/<service>/src/**'`
