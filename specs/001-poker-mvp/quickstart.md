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
- API Metrics: http://localhost:4000/metrics
- Keycloak: http://localhost:8080
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

## Expected Local Stack

- ui: React app (static server)
- api: Express server (REST + WebSocket)
- keycloak: OIDC provider
- keycloak-db: Postgres for Keycloak
- redis: state store for tables, profiles, friends, moderation, push, and events
- otel-collector: receives OTLP from UI/API
- prometheus: metrics store
- grafana: dashboards and datasources

## First-Time Setup Notes

- Import the Keycloak realm config from `infra/keycloak/`.
- Ensure the UI origin is allowed in Keycloak client settings.
- To enable Google login, create a Google OAuth client and add a Keycloak Identity Provider:
  - Redirect URI: `http://localhost:8080/realms/poker-local/broker/google/endpoint`
  - In Keycloak Admin UI, add Identity Providers -> Google, then set the client ID/secret.
- Use demo users or enable self-registration for local testing.
- For turn notifications, generate VAPID keys and set env vars before starting the stack:
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)
  - Example: `npx web-push generate-vapid-keys`
- Grafana provisions the "Poker Observability" dashboard automatically.
- In Grafana, confirm the Prometheus data source points to `http://prometheus:9090`.

## Smoke Test

1. Log in and enter the lobby.
2. Create a table and join a seat.
3. Open a second browser session to verify real-time updates and chat.
4. Open Grafana and confirm the Poker Observability dashboard loads.
