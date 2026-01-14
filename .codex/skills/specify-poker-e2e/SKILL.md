---
name: specify-poker-e2e
description: Run and debug specify-poker end-to-end behavior against the docker-compose stack using Playwright (apps/ui/tests/e2e), including stack bring-up, readiness checks, and log/trace triage with docker compose and Grafana Loki/Tempo.
---

# Specify Poker E2e

## Quick Start

- Bring up the full stack: `docker compose up --build -d`
- Run external E2E tests (hits the compose stack, waits for readiness): `PLAYWRIGHT_EXTERNAL=1 npm --prefix apps/ui run test:e2e`

## Debug Workflow

Follow this loop until tests pass (prefer fixing root causes, not test retries):

1. Re-run just the failing test: `npm --prefix apps/ui run test:e2e -- <test-file> -g "<test name>"`
2. Collect local service logs:
   - Tail a single service: `docker compose logs -f gateway`
   - Since a timestamp: `docker compose logs --since 10m gateway player game balance event notify`
3. Use trace IDs from logs:
   - Gateway logs include `traceId` and `spanId` fields; use the `traceId` to correlate across services.
   - Grafana (http://localhost:3001) → Explore → Loki: `{service="gateway"} | json | traceId="<traceId>"`
   - Grafana → Explore → Tempo: paste the `traceId` to open the distributed trace.

## Environment Knobs (Playwright)

- Use `PLAYWRIGHT_EXTERNAL=1` to disable the Playwright `webServer` and run against docker-compose.
- Use `PLAYWRIGHT_BASE_URL` to target a non-default UI URL (default `http://localhost:3000`).
- Use `PLAYWRIGHT_GATEWAY_URL`, `PLAYWRIGHT_KEYCLOAK_URL`, `PLAYWRIGHT_GRAFANA_URL`, `PLAYWRIGHT_LOKI_URL`, `PLAYWRIGHT_TEMPO_URL` for non-default service URLs.
- Use `PLAYWRIGHT_STACK_TIMEOUT_MS` (default `120000`) or `PLAYWRIGHT_SKIP_STACK_WAIT=1` to control global stack readiness polling.

## Common Failure Patterns

- `{"error":"ACCOUNT_NOT_FOUND"}` when joining a table: check Gateway table-join flow and Balance account provisioning.
- `13 INTERNAL: Table ID is required` from gateway: check WS session-event publishing includes a non-empty `table_id`.
- Player DB `profiles_pkey` duplicate key errors: check Player profile provisioning uses `INSERT ... ON CONFLICT` (avoid error-log spam).
- Game stuck on `PREFLOP` / “Current Turn” points at an empty seat: inspect `hand.turn` + seat statuses and look for duplicate seating; use `.codex/skills/specify-poker-game-stall-triage/SKILL.md`.

## Resources

### scripts/
- `scripts/stack_up.sh`: Bring up the stack and print key URLs.
### references/
- Prefer the high-level specs in `specs/*.md` and service specs in `apps/*/spec/*.md` as the source of truth for E2E behavior.
