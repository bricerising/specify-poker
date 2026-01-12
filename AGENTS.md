# specify-poker Development Guidelines

Last updated: 2026-01-12

## System Specifications

The project follows a thematic specification structure located in the `specs/` root:
- `000-quickstart.md`: Local setup and environment guide.
- `001-poker-gameplay.md`: Rules, engine logic, and hand evaluation.
- `002-poker-economy.md`: Balance management, ledger integrity, and transactions.
- `003-observability-stack.md`: Centralized LGTM (Loki, Grafana, Tempo, Mimir) stack.
- `004-analytics-insights.md`: Data-driven feedback loop and business metrics.
- `005-player-identity.md`: Profiles, statistics, and social features.
- `006-gateway-and-connectivity.md`: Authentication, WebSockets, and routing.
- `007-event-sourcing-and-audit.md`: Immutable event logs and hand history.

## Microservice Implementation

Detailed implementation plans, tasks, and service-specific data models are maintained in the `spec/` folder of each microservice:
- `apps/balance/spec/`
- `apps/event/spec/`
- `apps/game/spec/`
- `apps/gateway/spec/`
- `apps/notify/spec/`
- `apps/player/spec/`

## Active Technologies

- **Frontend**: React 18, TypeScript, Tailwind CSS.
- **Backend**: Node.js 20 LTS, Express, gRPC (@grpc/grpc-js).
- **Storage**: PostgreSQL (durability), Redis (hot state, caching, pub/sub).
- **Auth**: Keycloak (OIDC).
- **Observability**: OpenTelemetry, Prometheus, Loki, Tempo, Grafana.

## Project Structure

```text
apps/           # Microservices and UI
infra/          # Infrastructure configurations (Grafana, Keycloak, OTel)
specs/          # High-level system specifications
```

## Recent Changes

- **Microservice Deconstruction**: Successfully split the monolithic API into focused domain services.
- **Unified Observability**: Integrated LGTM stack with distributed tracing.
- **Specification Reorganization**: Transitioned from monolithic feature folders to thematic, system-wide specifications.
