# Specification: Unified Observability Stack

## Overview

This document defines the unified observability stack for the poker microservices
ecosystem. The stack is designed to provide comprehensive visibility into system
performance, user behavior, and operational health through the integration of
metrics, logs, and traces.

## Architecture

The stack follows the LGTM (Loki, Grafana, Tempo, Mimir/Prometheus) pattern,
orchestrated via OpenTelemetry for a vendor-neutral instrumentation layer.

```
┌─────────────────┐      OTLP (gRPC/HTTP)      ┌─────────────────────────┐
│  Microservices  │───────────────────────────►│  OpenTelemetry Collector│
│  (Balance, Game,│                            │                         │
│   Gateway...)   │◄───────────────────────────┤                         │
└────────┬────────┘                            └─────┬────────┬────────┬─┘
         │                                           │        │        │
         │ Logs (stdout)                             ▼        ▼        ▼
         ▼                                     ┌────────┐┌────────┐┌────────┐
┌─────────────────┐                            │Prometheus Loki   ││ Tempo  │
│  Docker Engine  │                            │(Metrics) (Logs)  ││(Traces)│
└────────┬────────┘                            └─────┬────────┬────────┬────┘
         │                                           │        │        │
         ▼                                           ▼        ▼        ▼
┌─────────────────┐                            ┌─────────────────────────┐
│  Loki Driver    │───────────────────────────►│        Grafana          │
│  (Local Dev)    │                            │      (Dashboards)       │
└─────────────────┘                            └─────────────────────────┘
```

## Components

### 1. Metrics (Prometheus)
- **Role**: Quantitative data about system behavior.
- **Exposure**: Services expose `/metrics` endpoint for Prometheus scraping.
- **Key Metrics**: RED (Rate, Error, Duration) for APIs, business metrics (pots, balances),
  and infrastructure metrics (Redis/DB connections).

### 2. Logs (Loki)
- **Role**: Immutable, timestamped events with rich context.
- **Format**: Structured JSON (standardized via Pino/Winston).
- **Correlation**: Every log entry includes `traceId` and `spanId` for direct
  navigation to related traces.
- **Transport**: Logs are written to stdout/stderr and collected by Loki (via the
  OTEL collector or Docker log driver).
- **Analytics Link**: Aggregated logs are used to derive session duration and 
  other product metrics (see `specs/004-analytics-insights.md`).

### 3. Traces (Tempo)
- **Role**: Request lifecycle visualization across service boundaries.
- **Protocol**: OpenTelemetry (OTLP) over gRPC.
- **Root Trace**: Initiated by the Gateway Service for every client request.
- **Propagation**: gRPC metadata (W3C Trace Context) ensures traces are linked
  across Balance, Game, Event, and Notify services.
- **Service Map**: Generated from traces via OTel Collector `servicegraph`/`spanmetrics` connectors and visualized in Grafana’s Tempo datasource (backed by Prometheus metrics like `traces_service_graph_request_total`).

### 4. Visualization (Grafana)
- **Role**: Single pane of glass for all telemetry data.
- **Provisioning**: Dashboards and datasources are version-controlled in `/infra/grafana`.
- **Integrations**: Log-to-trace (Loki -> Tempo) and Trace-to-metrics (Tempo -> Prometheus)
  navigation enabled via derived fields.

## Local Development (Docker Compose)

The following services are included in the local environment:

- **Prometheus**: `http://localhost:9090`
- **Loki**: `http://localhost:3100`
- **Tempo**: `http://localhost:3200`
- **Grafana**: `http://localhost:3001` (Default login: admin/admin)
- **OTEL Collector**: `localhost:4317` (gRPC) / `localhost:4318` (HTTP)

Note: Grafana queries Tempo via an internal `tempo-grafana-proxy` that normalizes `start`/`end` query parameters (Grafana uses milliseconds, Tempo `api/search` expects seconds).

## Success Criteria

- **Correlation**: 100% of error logs contain a `traceId`.
- **Latency**: P99 trace ingestion latency under 1 second.
- **Completeness**: All 6 microservices export metrics, logs, and traces.
