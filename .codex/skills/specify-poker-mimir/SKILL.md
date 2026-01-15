---
name: specify-poker-mimir
description: Integrate and troubleshoot Grafana Mimir as the Prometheus-compatible metrics backend in specify-poker’s docker-compose stack, including OTel Collector scraping + remote_write, Grafana datasource provisioning, PromQL validation, and diagnosing ring/remote-write startup issues. Use when replacing Prometheus, debugging missing metrics/service map, or fixing Mimir/otel-collector compose failures.
---

# Specify Poker Mimir

## Quick Start (Local Compose)

- Bring up the stack: `docker compose up --build -d`
- Verify Mimir Prometheus API: `curl -sS http://localhost:9009/prometheus/api/v1/status/buildinfo | jq .data.version`
- Confirm ingestion for all services:
  - `curl -sS 'http://localhost:9009/prometheus/api/v1/query?query=count%20by%20(job)%20(process_cpu_user_seconds_total)' | jq -r '.data.result[].metric.job' | sort`
- Check scrape health series:
  - `curl -sS 'http://localhost:9009/prometheus/api/v1/query?query=up' | jq -r '.data.result[] | "\(.metric.job) \(.metric.instance) up=\(.value[1])"' | sort`

If these commands fail due to Docker socket / localhost restrictions in a sandboxed agent environment, rerun them with escalated permissions.

## How Metrics Flow

- Services expose Prometheus-format metrics on `/metrics`.
- `otel-collector` scrapes via `receivers.prometheus` and exports:
  - `prometheusremotewrite` → Mimir (`/api/v1/push`)
  - derived trace metrics via `connectors: servicegraph, spanmetrics` (used by Tempo Service Map)
- Grafana’s Prometheus datasource points at Mimir (`/prometheus` prefix).

## Key Config Files

- `infra/mimir/mimir.yaml`: Single-node dev config (ensure `ingester.ring.replication_factor: 1`).
- `infra/otel/collector-config.yaml`: `receivers.prometheus` scrape configs + `exporters.prometheusremotewrite`.
- `infra/grafana/provisioning/datasources/datasource.yaml`: Prometheus datasource `url: http://mimir:9009/prometheus`.

## Common Failure Patterns

### Mimir exits on startup (config parse errors)

- Inspect: `docker compose logs mimir`
- Validate keys against Mimir’s config schema:
  - `docker run --rm grafana/mimir:<version> -print.config > /tmp/mimir-default.yaml`
- Keep the local config minimal; avoid fields not present in the current schema.

### Remote write fails: “at least 2 live replicas required”

- Symptom (Mimir logs): `at least 2 live replicas required, could only find 1`
- Fix: set `ingester.ring.replication_factor: 1` in `infra/mimir/mimir.yaml`.

### Remote write fails: “empty ring” (often right after restart)

- Symptom: Mimir returns 500 `empty ring` while modules start.
- Fix: wait ~10–30s; if persistent:
  - `docker compose restart mimir otel-collector`

### `otel-collector` unhealthy in compose

- The `otel/opentelemetry-collector-contrib` image doesn’t support `CMD-SHELL` healthchecks.
- Prefer `["CMD","/otelcol-contrib","--version"]` in `docker-compose.yml`.

## Grafana Validation (Optional)

- Confirm datasource URL:
  - `curl -sS -u admin:admin http://localhost:3001/api/datasources/uid/PROMETHEUS | jq -r .url`
- Confirm Grafana can query Mimir:
  - `curl -sS -u admin:admin 'http://localhost:3001/api/datasources/proxy/1/api/v1/query?query=up' | jq '.data.result | length'`

## Cleanup

- If you removed Prometheus from compose and see “orphan containers” warnings:
  - `docker compose up -d --remove-orphans`
