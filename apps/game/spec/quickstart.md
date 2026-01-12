# Quickstart: Game Service

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
   cd apps/game
   npm install
   ```

3. Start the service:
   ```bash
   npm run dev
   ```

## Default Local URLs

- gRPC: localhost:50053
- Health Check: (gRPC Health Protocol)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRPC_PORT` | 50053 | gRPC server port |
| `REDIS_URL` | (none) | Redis connection URL |
| `BALANCE_SERVICE_URL` | localhost:50051 | Balance gRPC endpoint |
| `EVENT_SERVICE_URL` | localhost:50054 | Event gRPC endpoint |

## gRPC Methods

The game service exposes the following gRPC methods:

- `CreateTable` - Create a new poker table
- `JoinSeat` - Join an open seat (buy-in)
- `LeaveSeat` - Leave a seat (cash-out)
- `SubmitAction` - Submit a game action (Fold, Call, Raise)
- `GetTableState` - Get full state for a table
- `KickPlayer` - Remove player from table (Owner only)
- `MutePlayer` - Block player chat (Owner only)

## Running Tests

```bash
cd apps/game
npm test
```
