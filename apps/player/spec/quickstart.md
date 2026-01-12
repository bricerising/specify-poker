# Quickstart: Player Service

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
   cd apps/player
   npm install
   ```

3. Start the service:
   ```bash
   npm run dev
   ```

## Default Local URLs

- gRPC: localhost:50052
- Health Check: (gRPC Health Protocol)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRPC_PORT` | 50052 | gRPC server port |
| `DATABASE_URL` | (none) | PostgreSQL connection URL |
| `REDIS_URL` | (none) | Redis connection URL |

## gRPC Methods

The player service exposes the following gRPC methods:

- `GetProfile` - Retrieve user profile
- `UpdateProfile` - Update nickname or avatar
- `GetStatistics` - Retrieve hands played and wins
- `AddFriend` - Add user to friends list
- `RemoveFriend` - Remove user from friends list
- `DeleteProfile` - Permanent data deletion (GDPR)

## Running Tests

```bash
cd apps/player
npm test
```
