# Quickstart: Event Service

## Local Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20 LTS
- PostgreSQL (or via Docker)
- Redis (or via Docker)

## Start the Service

### Standalone Development

1. Start dependencies:
   ```bash
   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15-alpine
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. Install dependencies:
   ```bash
   cd apps/event
   npm install
   ```

3. Start the service:
   ```bash
   npm run dev
   ```

## Default Local URLs

- gRPC: localhost:50054
- Health Check: (gRPC Health Protocol)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRPC_PORT` | 50054 | gRPC server port |
| `DATABASE_URL` | (none) | PostgreSQL connection URL |
| `REDIS_URL` | (none) | Redis connection URL |

## gRPC Methods

The event service exposes the following gRPC methods:

- `PublishEvent` - Store a new game event
- `QueryEvents` - Search events by table, user, or hand
- `GetHandHistory` - Retrieve complete actions for a hand
- `GetHandReplay` - Get state snapshots for replay
- `SubscribeToStream` - Real-time event streaming (gRPC server stream)

## Running Tests

```bash
cd apps/event
npm test
```
