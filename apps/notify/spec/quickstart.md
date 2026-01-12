# Quickstart: Notify Service

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
   cd apps/notify
   npm install
   ```

3. Start the service:
   ```bash
   npm run dev
   ```

## Default Local URLs

- gRPC: localhost:50055
- Health Check: (gRPC Health Protocol)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRPC_PORT` | 50055 | gRPC server port |
| `REDIS_URL` | (none) | Redis connection URL |
| `VAPID_PUBLIC_KEY` | (none) | Web Push VAPID Public Key |
| `VAPID_PRIVATE_KEY` | (none) | Web Push VAPID Private Key |
| `VAPID_SUBJECT` | (none) | Web Push VAPID Subject (mailto:) |

## gRPC Methods

The notify service exposes the following gRPC methods:

- `RegisterSubscription` - Save a new web-push subscription
- `UnregisterSubscription` - Remove a web-push subscription
- `ListSubscriptions` - List all subscriptions for a user
- `SendNotification` - Trigger a notification to all user devices

## Running Tests

```bash
cd apps/notify
npm test
```
