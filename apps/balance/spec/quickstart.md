# Quickstart: Balance Service

## Local Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20 LTS

## Start the Service

### With Docker Compose (Full Stack)

From the repo root:
```bash
docker compose up
```

The balance service will be available alongside the poker service.

### Standalone Development

1. Start Redis:
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. Install dependencies:
   ```bash
   cd apps/balance
   npm install
   ```

3. Start the service:
   ```bash
   npm run dev
   ```

## Default Local URLs

- HTTP API: http://localhost:3002/api
- gRPC: localhost:50051
- Health Check: http://localhost:3002/api/health
- Metrics: http://localhost:9102/metrics

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 3002 | HTTP server port |
| `GRPC_PORT` | 50051 | gRPC server port |
| `METRICS_PORT` | 9102 | Prometheus metrics port |
| `REDIS_URL` | (none) | Redis connection URL |
| `RESERVATION_TIMEOUT_MS` | 30000 | Reservation expiry timeout |
| `IDEMPOTENCY_TTL_MS` | 86400000 | Idempotency key TTL (24h) |
| `LOG_LEVEL` | info | Structured log level |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | http://localhost:4317 | OTLP gRPC exporter endpoint |
| `JWT_SECRET` | default-secret | JWT secret for HS256 validation |

## API Quick Reference

**Note**: HTTP endpoints are internal-only and expected to be called via the
Gateway with authenticated identity headers. The examples below are for local
development only.

### HTTP Endpoints

```bash
# Get account balance
curl http://localhost:3002/api/accounts/{userId}/balance

# Deposit chips
curl -X POST http://localhost:3002/api/accounts/{userId}/deposit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: deposit-123" \
  -d '{"amount": 1000, "source": "FREEROLL"}'

# Get transaction history
curl http://localhost:3002/api/accounts/{userId}/transactions

# Get ledger entries
curl http://localhost:3002/api/accounts/{userId}/ledger
```

### gRPC Methods

The balance service exposes the following gRPC methods for internal use:

- `GetBalance` - Get account balance
- `EnsureAccount` - Create account if not exists
- `ReserveForBuyIn` - Reserve funds for table buy-in
- `CommitReservation` - Commit a reservation
- `ReleaseReservation` - Release a reservation
- `ProcessCashOut` - Credit winnings to account
- `RecordContribution` - Record pot contribution
- `SettlePot` - Distribute pot to winners
- `CancelPot` - Cancel an active pot

## Smoke Test

1. Start the service with Redis available
2. Check health: `curl http://localhost:3002/api/health`
3. Create an account and deposit:
   ```bash
   curl -X POST http://localhost:3002/api/accounts/test-user/deposit \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: smoke-test-1" \
     -d '{"amount": 5000, "source": "ADMIN"}'
   ```
4. Verify balance: `curl http://localhost:3002/api/accounts/test-user/balance`

## Running Tests

```bash
cd apps/balance
npm test
```
