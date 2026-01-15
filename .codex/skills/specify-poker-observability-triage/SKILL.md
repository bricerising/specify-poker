---
name: specify-poker-observability-triage
description: Triage and debug specify-poker issues using the LGTM stack (Grafana + Loki + Tempo + Prometheus) and docker compose logs, centered on OpenTelemetry traceId correlation across gateway/game/balance/player/event/notify; use for failing E2E tests, runtime 5xx/gRPC INTERNAL errors, auth/join-seat failures, or production-like compose debugging.
---

# Specify Poker Observability Triage

## Quick Start (Local Compose)

- Grafana: `http://localhost:3001` (datasources: Prometheus, Loki, Tempo)
- Tail logs: `docker compose logs -f gateway`

## Workflow Decision Tree

### A) You have a `traceId` (preferred)

1. Confirm the boundary error (usually `gateway`):
   - `docker compose logs --since 10m gateway | rg '<traceId>|\"level\":\"error\"'`
2. Loki (log correlation across services):
   - Explore → Loki → query:
     - `{service=~"gateway|game|balance|player|event|notify"} | json | traceId="<traceId>"`
3. Tempo (distributed trace):
   - Explore → Tempo → paste `<traceId>` (find the first error span; note `service.name`, RPC/HTTP route, and status).
4. Fix the root cause and re-run the smallest repro (one failing test or one request).

### B) You do not have a `traceId`

1. Start from the “closest” boundary:
   - UI symptom → `gateway`
   - gRPC INTERNAL between services → callee service (`game`, `balance`, `player`, `event`, `notify`)
2. Loki search by stable identifiers:
   - Error string: `{service="gateway"} |= "ACCOUNT_NOT_FOUND"`
   - User/table IDs (from URL or payload): `{service="gateway"} |= "37d501f4-..."` or `{service="gateway"} | json | userId="..."`
   - HTTP path: `{service="gateway"} |= "/api/tables/"`
3. Extract `traceId` from the matching log line, then switch to workflow A.

## Loki Queries (Useful Defaults)

- Errors for one service: `{service="gateway"} | json | level="error"`
- All services for one trace: `{service=~"gateway|game|balance|player|event|notify"} | json | traceId="<traceId>"`
- gRPC failures: `{service=~"gateway|game|balance|player|event|notify"} | json | err.code!=0`

## Gameplay Stall Quick Checks

- Stuck on `PREFLOP` / turn never advances:
  - Inspect state: `curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/tables/$TABLE_ID/state"`
  - Look for `hand.turn` pointing at an `EMPTY`/inactive seat, or duplicate `user_id` across seats.
  - Game logs: `docker compose logs --since 10m game | rg 'turn\\.repair\\.failed|NOT_YOUR_TURN'`
  - Deep dive: use `.codex/skills/specify-poker-game-stall-triage/SKILL.md`.

## Tempo Tips

- Gateway logs include `traceId`/`spanId` via Pino + OTel context.
- If a trace is missing spans, confirm the failing request actually hit the compose stack (not a locally-started service) and that `OTEL_EXPORTER_OTLP_ENDPOINT` is set for the service.
- If Grafana trace search fails with `invalid start ... value out of range`, confirm `tempo-grafana-proxy` is running and Grafana’s Tempo datasource URL points to `http://tempo-grafana-proxy:3200` (Grafana uses ms, Tempo `api/search` expects seconds).
- Service Map depends on Prometheus metrics produced from traces (OTel Collector `servicegraph`/`spanmetrics`); quick check: `traces_service_graph_request_total` should exist in Prometheus.
- For a focused “Grafana + Tempo traces/service map” playbook, use `.codex/skills/specify-poker-tempo-grafana-traces/SKILL.md`.

## Prometheus / Metrics (When It’s Intermittent)

- Use Grafana dashboards first (they’re provisioned in `infra/grafana/dashboards/`).
- If you need a quick “is it spiking?” view:
  - Check `job="gateway"` scrape target is `UP`.
  - Look for request error-rate or latency panels; then pivot back to Loki/Tempo for the specific trace(s).

## Scripts

### scripts/
- `scripts/loki_by_trace.py`: Query Loki’s HTTP API for a given `traceId` and print matching log lines.
