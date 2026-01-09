# Quickstart: Play-Money Poker MVP

## Local Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20 LTS

## Start the Full Stack

1. From repo root, run:
   `docker compose up`
2. Wait for services to become healthy.

## Default Local URLs

- UI: http://localhost:3000
- API REST: http://localhost:4000/api
- API WS: ws://localhost:4000/ws
- Keycloak: http://localhost:8080
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

## Expected Local Stack

- ui: React app (dev server or production build)
- api: Express server (REST + WebSocket)
- keycloak: OIDC provider
- keycloak-db: Postgres for Keycloak
- otel-collector: receives OTLP from UI/API
- prometheus: metrics store
- tempo (or jaeger): traces store
- loki: logs store (optional)
- grafana: dashboards and datasources
- reverse-proxy: optional local TLS and port unification

## First-Time Setup Notes

- Import the Keycloak realm config from `infra/keycloak/`.
- Ensure the UI origin is allowed in Keycloak client settings.
- Use demo users or enable self-registration for local testing.
- Grafana provisions the "Poker Observability" dashboard automatically.
- In Grafana, confirm the Prometheus data source points to `http://prometheus:9090`.

## Smoke Test

1. Log in and enter the lobby.
2. Create a table and join a seat.
3. Open a second browser session to verify real-time updates and chat.
4. Open Grafana and confirm the Poker Observability dashboard loads.
