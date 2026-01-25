# Code Quality Standards (Portable Template)

This document defines **baseline code quality standards** you can copy into any application repo.
It is written to be **enforceable** (via tooling + CI) and **reviewable** (via a short PR checklist).

> How to use:
> 1) Copy this file into your repo.
> 2) Fill in **Project Context**.
> 3) Adjust the few numeric thresholds (coverage, latency budgets) to match your product.
> 4) Implement the **Quality Gates** in CI so this document stays true.

---

## Project Context (fill in)

- **Product intent**:
- **Primary runtime(s)**:
- **Primary language(s)**:
- **Deployment model** (monolith, microservices, serverless, desktop, mobile):
- **Primary data stores**:
- **Public interfaces** (HTTP, gRPC, events/queues, CLI):
- **Security posture** (PII, authn/z, threat model link):
- **SLO/SLA** (availability/latency/error budgets):

---

## Principles

- **Correctness first**: prefer simple, verifiable behavior over cleverness.
- **Readable by default**: optimize for the next engineer reading the code.
- **Types + tests + telemetry**: use all three; none is sufficient alone.
- **Small, composable units**: isolate domain logic from I/O and frameworks.
- **Fail safely**: errors are explicit, actionable, and observable.

---

## Quality Bar (Definition of Done)

Every change that ships satisfies:

- [ ] Requirements are clear (acceptance scenarios / examples exist).
- [ ] Code is understandable without private context.
- [ ] Interfaces are explicit and versioned where appropriate.
- [ ] Lint + format + typecheck pass.
- [ ] Tests cover the change (unit + at least one “consumer/flow” test when applicable).
- [ ] Observability added/updated (logs/metrics/traces where relevant).
- [ ] Security and privacy reviewed for the change.
- [ ] Documentation updated (READMEs/specs/runbooks/ADRs as needed).

---

## Coding Standards (Readability)

### Structure

- Keep **domain logic** framework-agnostic (pure functions/classes where possible).
- Put I/O behind adapters (DB clients, HTTP clients, queue producers/consumers).
- Prefer a clear layering:
  - `api/` (handlers, controllers, transports)
  - `domain/` (business rules, invariants)
  - `services/` (orchestration, workflows)
  - `storage/` (DB/redis/filesystem)
  - `clients/` (external services)
  - `observability/` (logging, metrics, tracing)
  - `jobs/` (schedulers, background workers)

### Naming & size

- Use descriptive names over abbreviations.
- Keep functions small and single-purpose; extract helpers when branches multiply.
- Prefer early returns to deeply nested control flow.
- Avoid “mystery meat” booleans (`isReady` > `flag1`).
- Remove unused variables; if required by a signature, prefix with `_` (e.g., `_req`).

### Imports & modules

- Prefer ES modules: `import` / `export`.
- Avoid `require()` imports (except rare compatibility/bootstrapping needs).
- For dynamic loading, use `import()`.

### Error handling

- Treat error handling as product behavior:
  - categorize errors (validation, auth, not-found, conflict, internal)
  - include actionable messages for operators (logs) and safe messages for users (responses)
- Never swallow errors silently; either handle or log + propagate.
- Use `unknown` for caught errors and narrow via type guards (language equivalent in non-TS stacks).

---

## Type Safety & Boundary Validation

- Prefer **strict typing** (or strict mode equivalents).
- Ban or strongly discourage:
  - `any` (or untyped objects)
  - ad-hoc JSON shapes without validation
  - implicit `null`/`undefined` assumptions
- Validate all boundary inputs:
  - HTTP request bodies/query/headers
  - gRPC/event payloads
  - environment variables/config
- Use a schema library where available (e.g., Zod/Joi/JSON Schema/Protobuf validation).
- Keep schemas versioned and centralized (shared package/module) when multiple services/components consume them.

---

## Testing Strategy

### Required test layers (pick what applies)

- **Unit tests**: pure domain logic, invariants, edge cases.
- **Integration tests**: DB/redis adapters, repository implementations, external client wrappers (with test doubles where needed).
- **Consumer/flow tests**: realistic end-to-end flows from a consumer’s perspective (API calls, event flows).
- **Contract tests**: verify internal/external API contracts (OpenAPI/gRPC/proto/event schema compatibility).
- **E2E/UI tests** (if applicable): critical user journeys only; keep the suite small and stable.

### Coverage

- Set a coverage target for **core logic** (example: **≥ 80%**), but don’t chase coverage on glue code.
- Track coverage in CI and fail builds on meaningful regressions.

### Test quality rules

- Prefer deterministic tests (no sleeps; control time with fake timers).
- Test behavior, not implementation details.
- Always include representative edge cases and failure modes (timeouts, retries, partial failures, malformed input).
- Add regression tests for bugs before shipping the fix.

---

## Reliability & Data Integrity

### Idempotency & retries (distributed systems)

- Any **mutating** operation that can be retried must be **idempotent**.
- Accept an idempotency key (or equivalent mechanism) for write operations crossing process boundaries.
- Make retry behavior explicit (which calls are safe to retry and why).

### Invariants & verification

- Encode critical invariants in code (and validate them at boundaries).
- Prefer append-only or audited write paths when correctness matters (ledger/event log patterns).
- Add background/periodic verification where feasible (checksums, reconciliation jobs).

### Operational behavior

- Graceful startup/shutdown:
  - on startup: initialize observability first, then dependencies, then listeners
  - on shutdown: stop accepting traffic, drain work, close resources, flush telemetry
- Provide `health` and `ready` endpoints (or equivalents) with clear degraded reasons.

---

## Observability

### Logs

- Use structured logging (JSON) with stable keys.
- Include correlation IDs (e.g., `traceId`/`spanId`, request IDs, user/session IDs when safe).
- Log errors with stack traces and relevant context (never secrets).

### Metrics

- Expose RED/USE metrics as appropriate:
  - Rate, Errors, Duration for APIs/handlers
  - resource metrics: CPU/mem, queue depth, DB pool stats
- Define a small set of **business metrics** that reflect success for your product.

### Traces

- Instrument inbound requests and propagate context across service boundaries.
- Add spans around high-latency or failure-prone operations (DB calls, external requests).

### Success criteria (example)

- 100% of error logs contain a correlation identifier.
- P99 telemetry ingestion latency < 1s (for systems where that matters).

---

## Security & Privacy

- Threat model the app (at least a lightweight checklist) and keep it updated.
- Validate and sanitize all untrusted input.
- Enforce authentication + authorization at the boundary; avoid “trusting the caller”.
- Store secrets only in secret managers / env vars; never commit secrets.
- Use least privilege for DB/users/roles/tokens.
- Keep dependencies updated and run vulnerability scans in CI.
- Add privacy rules when handling PII:
  - data minimization
  - retention policies
  - deletion workflows where required
  - safe logging (no PII/secrets)

---

## Tooling & CI Quality Gates

Make the standards **non-optional** by enforcing them:

- **Lint**: fails on errors; warnings must be tracked (no “warning flood”).
- **Format**: use an auto-formatter; CI runs “format check”.
- **Typecheck**: strict; CI runs full typecheck.
- **Tests**: CI runs test suites (unit + integration + contract + e2e as applicable).
- **Coverage**: CI enforces thresholds for core logic.
- **Build**: CI validates production build artifacts.
- **Policy checks** (optional but recommended):
  - dependency vulnerability scanning
  - license policy
  - secret scanning

---

## PR Review Checklist (short)

Reviewers should be able to answer “yes” to:

- [ ] The change matches the requirement and handles edge cases.
- [ ] The code is readable and appropriately structured (domain vs I/O).
- [ ] Interfaces/contracts are explicit; backwards compatibility considered.
- [ ] Tests are realistic and cover failures (not just happy path).
- [ ] Observability is sufficient to debug production issues.
- [ ] No secrets/PII introduced into logs, configs, or commits.
- [ ] Performance risks identified and mitigated (or intentionally accepted).

---

## Suggested Repo Conventions (optional)

- `specs/` (or `docs/`): source-of-truth intent, constraints, non-goals, and NFRs.
- `apps/` + `packages/` (or `services/` + `libs/`): clear ownership boundaries.
- Per-service `spec/quickstart.md`: “how to run locally” and “how to test”.
- A small number of top-level commands:
  - `lint`, `test`, `build`, `typecheck`, `format`

---

## Appendix: Example NPM Scripts (Node/TypeScript)

Adjust names/tools to match your stack:

```jsonc
{
  "scripts": {
    "lint": "eslint .",
    "format": "prettier . --check",
    "format:write": "prettier . --write",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "build": "tsc -p tsconfig.json"
  }
}
```
