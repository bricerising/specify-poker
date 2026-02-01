# Quickstart: Gateway Service

## Local Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20 LTS
- Redis (or via Docker)

## Start the Service

### Standalone Development

1. Start Redis:
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. Install dependencies:
   ```bash
   cd apps/gateway
   npm install
   ```

3. Start the service:
   ```bash
   npm run dev
   ```

## Default Local URLs

- Gateway (HTTP API): http://localhost:4000/api
- Gateway (WebSocket): ws://localhost:4000/ws
- Health Check: http://localhost:4000/health
- Readiness: http://localhost:4000/ready
- Metrics: http://localhost:9100/metrics (or `METRICS_PORT`)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Gateway listening port |
| `METRICS_PORT` | 9100 | Prometheus metrics port (serves `/metrics`) |
| `CORS_ORIGIN` | http://localhost:3000 | Allowed CORS origin |
| `TRUST_PROXY_HOPS` | 0 | Set > 0 when behind a reverse proxy (trust `X-Forwarded-For`) |
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |
| `KEYCLOAK_URL` | http://localhost:8080 | Keycloak base URL (RS256 verification) |
| `KEYCLOAK_REALM` | poker-local | Keycloak realm name |
| `JWT_PUBLIC_KEY` | (none) | Optional RS256 public key PEM (overrides Keycloak) |
| `JWT_ISSUER` | (none) | Optional JWT issuer claim to enforce |
| `JWT_AUDIENCE` | (none) | Optional JWT audience claim to enforce |
| `JWT_SECRET` | (empty) | Legacy HS256 secret (prefer `JWT_HS256_SECRET`) |
| `JWT_HS256_SECRET` | (none) | Optional HS256 secret for local/dev tokens |
| `GRPC_CLIENT_TIMEOUT_MS` | 2000 | Default timeout for outbound gRPC calls (ms) |
| `GAME_SERVICE_URL` | localhost:50053 | Game gRPC endpoint |
| `PLAYER_SERVICE_URL` | localhost:50052 | Player gRPC endpoint |
| `BALANCE_SERVICE_URL` | localhost:50051 | Balance gRPC endpoint |
| `BALANCE_SERVICE_HTTP_URL` | localhost:3002 | Balance HTTP endpoint (for `/api/accounts*` proxy) |
| `EVENT_SERVICE_URL` | localhost:50054 | Event gRPC endpoint |
| `NOTIFY_SERVICE_URL` | localhost:50055 | Notify gRPC endpoint |

## Features

The gateway service provides:

- **JWT Authentication**: Validates tokens before routing requests.
- **WebSocket Termination**: Handles client connections and subscriptions.
- **Service Proxying**: Routes HTTP requests to appropriate backend services.
- **Real-time Broadcasting**: Distributes messages across instances via Redis Pub/Sub.

## Running Tests

```bash
cd apps/gateway
npm test
```
