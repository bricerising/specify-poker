# specify-poker

Private, self-hosted, play-money Texas Hold’em for friends — built as a set of small Node/TypeScript services with a React UI.

This repo is intentionally **not** a public poker network and does **not** handle real-money payments. See `specs/009-private-games-and-product-scope.md`.

## Quickstart (Docker Compose)

**Requirements**

- Docker Desktop (or Docker Engine) with Compose
- Node.js 20 LTS (the repo uses `nvm`)

**Start the full stack**

```bash
# Optional (push notifications): generate VAPID keys in `.env`
npm run env:local
docker compose up --build
```

More detail: `specs/000-quickstart.md`.

**Default local URLs**

- UI: http://localhost:3000
- Gateway (HTTP API): http://localhost:4000/api
- Gateway (WebSocket): ws://localhost:4000/ws
- Keycloak: http://localhost:8080
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- Loki: http://localhost:3100
- Tempo: http://localhost:3200

**First smoke test**

1. Open the UI and click **Login**.
2. In Keycloak, use **Register** to create a user (realm import is handled by docker compose).
3. Create a table, join a seat, and play a hand (use a second browser profile/incognito to simulate another player).
4. Open Grafana and check dashboards in `infra/grafana/dashboards/`.

**Reset local state (DBs, Keycloak, etc.)**

```bash
docker compose down -v
```

## Architecture (High Level)

**Entry point**

- `apps/gateway`: single entry point for HTTP + WebSocket; validates auth, rate-limits, proxies HTTP, and coordinates internal gRPC calls.

**Domain services (internal gRPC)**

- `apps/game`: table lifecycle + deterministic Texas Hold’em state machine (actions, betting rounds, showdown).
- `apps/balance`: play-money chips, buy-in reservations, pot contributions, settlement, and an auditable ledger.
- `apps/player`: profiles, friends, and statistics (Postgres-backed).
- `apps/event`: append-only event store + hand history/replay (Redis + Postgres).
- `apps/notify`: web-push subscriptions + turn alerts (Redis-backed).

**State & infrastructure**

- Redis: hot state, caching, pub/sub, and streams.
- Postgres: durable storage for player + event services (and Keycloak).
- Keycloak: OIDC auth provider (`infra/keycloak/realm-export.json`).
- Observability: OpenTelemetry -> Prometheus/Loki/Tempo -> Grafana (`infra/` + `specs/003-observability-stack.md`).

## Repository Map

```text
apps/           # Microservices + UI
packages/       # Shared libraries (ex: packages/shared)
infra/          # Keycloak, OTel collector, Prometheus, Grafana, Loki, Tempo configs
specs/          # System-level specifications and standards
```

Specs are the source-of-truth for intent and constraints:

- System specs: `specs/000-quickstart.md` … `specs/009-private-games-and-product-scope.md`
- Per-service specs: `apps/*/spec/` (quickstarts, data models, plans, tasks)

## Documentation Guide

**Start here**

- `specs/000-quickstart.md`: local setup and expected URLs
- `docker-compose.yml`: local stack wiring (services, ports, env vars)

**System specifications**

- `specs/001-poker-gameplay.md`: rules, engine logic, hand evaluation
- `specs/002-poker-economy.md`: balance, ledger integrity, transactions
- `specs/003-observability-stack.md`: LGTM stack + OpenTelemetry wiring
- `specs/004-analytics-insights.md`: metrics and analytics intent
- `specs/005-player-identity.md`: profiles, stats, social features
- `specs/006-gateway-and-connectivity.md`: auth, WebSockets, routing
- `specs/007-event-sourcing-and-audit.md`: immutable events + hand history
- `specs/008-code-quality-and-linting.md`: linting and code standards
- `specs/009-private-games-and-product-scope.md`: product intent and non-goals

**Service specs**

Each service has a local quickstart + spec bundle in `apps/<service>/spec/`.

## Developer Workflow (NPM Workspaces)

**Node version**

The repo targets Node 20. If you use `nvm`:

```bash
source ~/.zshrc
nvm use 20
```

**Install**

```bash
npm ci
```

**Common commands (repo root)**

- Build all workspaces: `npm run build`
- Run tests: `npm test`
- Lint: `npm run lint`

**Run a single workspace**

```bash
npm -w @specify-poker/gateway run dev
npm -w @specify-poker/game run dev
```

For full per-service setup (env vars + dependencies), start with each service quickstart:
`apps/gateway/spec/quickstart.md`, `apps/game/spec/quickstart.md`, etc.

## UI Development Notes

The UI is intentionally lightweight:

- TypeScript compiles to ESM in `apps/ui/dist/` (no bundler).
- `apps/ui/server.mjs` serves `apps/ui/public/` plus built assets.
- The browser loads React + dependencies via `importmap` from `https://esm.sh/` (internet required for the UI to load).

Two-terminal loop:

```bash
# terminal 1: rebuild on change
npm -w @specify-poker/ui run build -- --watch

# terminal 2: serve the app
npm -w @specify-poker/ui start
```

## Configuration / Environment Variables

Docker Compose loads environment variables from a root `.env` file (ignored by git).

Generate a local `.env` with VAPID keys:

```bash
npm run env:local
```

**Push notifications (optional)**

Set these for `notify` (and `gateway` for public key exposure):

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (typically `mailto:...`)

You can generate VAPID keys locally with:

```bash
npx web-push generate-vapid-keys
```

## Keycloak (Auth)

- Admin: http://localhost:8080 (admin/admin)
- Realm: `poker-local` (imported from `infra/keycloak/realm-export.json`)
- UI client: `poker-ui`

Optional Google login redirect URI:
`http://localhost:8080/realms/poker-local/broker/google/endpoint`

## Observability

Local stack (via docker compose):

- OTLP ingest (Tempo): `localhost:4317` (OTLP gRPC), `localhost:4318` (OTLP HTTP)
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090
- Loki: http://localhost:3100
- Tempo: http://localhost:3200

Within docker compose, services export OTLP to `otel-collector:4317` (internal), which forwards to Tempo and produces service-graph/span-metrics.

See `specs/003-observability-stack.md` for trace/log correlation and dashboard wiring details.

## Testing

- All tests (repo root): `npm test`
- Single service: `npm -w @specify-poker/balance test`
- UI E2E (Playwright): `npm -w @specify-poker/ui run test:e2e` (you may need `npx playwright install`)

## Code Quality

Standards live in `specs/008-code-quality-and-linting.md`. Key points:

- No `any`, no `require()`, no unused variables (use `_` prefix if needed).
- `npm run lint` must pass.
- Prefer realistic, consumer-centric tests for service behavior.
