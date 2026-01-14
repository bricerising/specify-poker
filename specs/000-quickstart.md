# Quickstart: Private Play-Money Poker

## Intent

This repo is optimized for **friends hosting private games** in a self-hosted stack.
It is not designed as a public matchmaking or real-money gambling platform (see `specs/009-private-games-and-product-scope.md`).

## Local Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20 LTS

## Start the Full Stack

1. From repo root, run:
   ```bash
   docker compose up
   ```
2. Wait for services to become healthy.

## Default Local URLs

- **UI**: http://localhost:3000
- **Gateway (HTTP API)**: http://localhost:4000/api
- **WebSocket**: ws://localhost:4000/ws
- **Balance Service (HTTP)**: http://localhost:3002/api
- **Keycloak**: http://localhost:8080
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001
- **Loki**: http://localhost:3100
- **Tempo**: http://localhost:3200

## Expected Local Stack

- **ui**: React app (static server)
- **gateway**: API Gateway and WebSocket proxy (entry point for all traffic)
- **balance**: Distributed balance service (manages accounts and transactions)
- **game**: Poker game engine and table management
- **player**: User profiles, statistics, and social features
- **event**: Immutable event store and hand history
- **notify**: Web push notifications and alerts
- **keycloak**: OIDC provider with Keycloak DB (PostgreSQL)
- **redis**: State store for tables, profiles, friends, and caching.
- **otel-collector**: Receives OTLP traces, metrics, and logs.
- **prometheus**: Metrics storage and querying.
- **loki**: Centralized log storage.
- **tempo**: Distributed trace storage.
- **grafana**: Unified visualization for metrics, logs, and traces.

## First-Time Setup Notes

- **Keycloak**: Import the realm config from `infra/keycloak/` (self-registration enabled via the **Register** link).
- **Google Login**: To enable Google login, create a Google OAuth client and add a Keycloak Identity Provider:
  - Redirect URI: `http://localhost:8080/realms/poker-local/broker/google/endpoint`
- **Notifications**: Generate VAPID keys and set env vars before starting the stack:
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **Observability**: Grafana provisions dashboards automatically from `infra/grafana/dashboards/`.

## Running Tests

To run tests across all packages:
```bash
npm test
```

To run tests for a specific service:
```bash
cd apps/balance
npm test
```

## Quality Standards

Every application in the ecosystem MUST adhere to the following quality standards:

- **Unit Test Coverage**: Maintain at least 80% coverage for all core logic, services, and handlers.
- **Realistic Behavior**: Unit tests MUST reflect realistic consumer behavior, including edge cases, error conditions, and cross-service interaction simulations.
- **Observability Integration**: All services MUST be fully instrumented with OpenTelemetry (OTLP) for traces, metrics, and logs.
- **Contract Verification**: Internal gRPC and external HTTP APIs MUST be verified against their respective specifications.

## Smoke Test

1. Log in to the UI and enter the lobby.
2. Create a table and join a seat.
3. Open a second browser session (or invite a friend to your instance) to verify real-time updates and chat.
4. Open Grafana (`http://localhost:3001`) and confirm the "Poker Observability" dashboard loads.
