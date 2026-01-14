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

- WebSocket/HTTP: http://localhost:4000
- Health Check: http://localhost:4000/health

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Gateway listening port |
| `REDIS_URL` | (none) | Redis connection URL |
| `KEYCLOAK_URL` | (none) | Keycloak base URL |
| `GAME_SERVICE_URL` | localhost:50053 | Game gRPC endpoint |
| `PLAYER_SERVICE_URL` | localhost:50052 | Player gRPC endpoint |
| `BALANCE_SERVICE_URL` | localhost:50051 | Balance gRPC endpoint |
| `EVENT_SERVICE_URL` | localhost:50054 | Event gRPC endpoint |

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
