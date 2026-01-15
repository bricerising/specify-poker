---
name: specify-poker-tempo-grafana-traces
description: Troubleshoot Grafana Tempo traces and the Tempo Service Map in specify-poker’s docker-compose LGTM stack. Use when Grafana shows empty traces/service map, service-map edges look slow, Tempo search errors like “invalid start … value out of range”, or trace panels are missing data.
---

# Specify Poker Tempo + Grafana Traces

## Quick Checks

1. Confirm the stack is up:
   - `docker compose ps grafana tempo tempo-grafana-proxy otel-collector mimir`
2. Confirm Tempo is reachable and has traces (direct):
   - `curl -sS http://localhost:3200/ready`
   - `curl -sS 'http://localhost:3200/api/search?q=%7B%7D' | jq '.traces | length'`
3. Confirm Grafana can search Tempo (via datasource proxy, uses **ms** start/end):
   - `END_MS=$(date +%s000); START_MS=$((END_MS-15*60*1000))`
   - `curl -sS -u admin:admin "http://localhost:3001/api/datasources/proxy/3/api/search?q=%7B%7D&start=$START_MS&end=$END_MS" | jq '.traces | length'`

If any of these commands fail due to `EPERM` or Docker socket access, rerun them with escalated sandbox permissions in the Codex CLI harness.

## Common Fixes

### A) Grafana search fails with `invalid start … value out of range`

Cause: Grafana sends `start`/`end` in **milliseconds**; Tempo `api/search` expects **seconds**.

Fix:
- Ensure `tempo-grafana-proxy` is running in compose and Grafana’s Tempo datasource points to it:
  - `infra/grafana/provisioning/datasources/datasource.yaml`
  - `docker-compose.yml` service `tempo-grafana-proxy`
- Validate:
  - `curl -sS -u admin:admin http://localhost:3001/api/datasources/uid/TEMPO | jq '.url'`
  - Expected: `http://tempo-grafana-proxy:3200`

### B) Service Map is empty

Cause: Tempo Service Map in Grafana requires **Prometheus-format metrics derived from traces** (service graph).

Fix:
- Enable OTel Collector connectors and export them to the metrics backend (Mimir):
  - `infra/otel/collector-config.yaml` should include `connectors: servicegraph, spanmetrics`
- Configure Tempo datasource service map to use Prometheus:
  - `infra/grafana/provisioning/datasources/datasource.yaml` `jsonData.serviceMap.datasourceUid: PROMETHEUS`
- Validate metrics exist in Mimir (Prometheus API):
  - `curl -sS 'http://localhost:9009/prometheus/api/v1/label/__name__/values' | jq -r '.data[]' | rg '^traces_service_graph_' | head`
  - `curl -sS 'http://localhost:9009/prometheus/api/v1/query?query=traces_service_graph_request_total' | jq '.data.result | length'`

## Generate Traffic (If Data Is Sparse)

- Fastest: `PLAYWRIGHT_EXTERNAL=1 npm --prefix apps/ui run test:e2e -- tests/e2e/smoke.spec.ts`
- Or: play a hand in the UI (login → create table → seat 2 players → act).

## Diagnose Slow Service Map Edges

1. Confirm the edge is actually slow (metrics from traces):
   - Top edges by p95: `topk(10, histogram_quantile(0.95, sum by (le, client, server) (rate(traces_service_graph_request_client_seconds_bucket{failed="false"}[5m]))))`
   - One edge (p95): `histogram_quantile(0.95, sum by (le) (rate(traces_service_graph_request_client_seconds_bucket{client="game-service",server="event-service",failed="false"}[5m])))`
2. Find representative traces in Tempo (prefer Grafana Explore → Tempo):
   - Filter by caller: `{resource.service.name="game-service"}`
   - Narrow to RPC target (example): `{resource.service.name="game-service" && span.rpc.service="event.EventService"}`
3. In the slow trace, open the slow client span and look for time sinks underneath:
   - DB/Redis spans, downstream gRPC spans, long gaps (missing spans) or retry loops.

## Common Root Cause: Redis Head-of-Line Blocking (Streams)

Symptom:
- Spans show ~`BLOCK`-sized plateaus (often ~5s) around otherwise-fast operations like `INCR`, `HSET`, `XADD`, etc.

Cause:
- A shared Redis connection is used for both:
  - Blocking commands (`XREADGROUP` / `XREAD` with `BLOCK`)
  - Normal commands needed by request handlers

Fix pattern (node-redis):
- Use a dedicated Redis client for blocking stream reads:
  - `const blockingClient = client.duplicate()`
  - Connect both, and use `blockingClient` for `XREADGROUP`/`XREAD` (+ related `XACK`) while keeping the main client for normal ops.
