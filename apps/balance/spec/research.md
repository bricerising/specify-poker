# Research: Balance Service

## Decisions

### Decision: Separate microservice for balance management
**Rationale**: Isolates financial operations from game logic, enabling independent
scaling, deployment, and clean auditability for debugging and dispute resolution.
**Alternatives considered**: Keeping balance in poker service (rejected for audit
complexity and single-point-of-failure concerns).

### Decision: gRPC for internal communication
**Rationale**: Lower latency than HTTP REST for synchronous operations between
poker and balance services. Strong typing via protobuf reduces integration errors.
**Alternatives considered**: HTTP REST (rejected for latency), message queue
(rejected for complexity of request-response pattern).

### Decision: Two-phase commit for buy-in
**Rationale**: Prevents race conditions and ensures atomicity when user joins a
table. Reservation pattern allows rollback if seat assignment fails.
**Alternatives considered**: Single-phase debit (rejected due to potential for
lost funds on failures).

### Decision: Append-only ledger with checksum chain
**Rationale**: Provides an immutable audit trail. Checksum chain enables tamper
detection and integrity verification.
**Alternatives considered**: Mutable transaction log (rejected for audit concerns).

### Decision: Redis for persistence with in-memory cache
**Rationale**: Matches existing poker service pattern. Provides durability while
enabling fast reads from memory cache.
**Alternatives considered**: PostgreSQL (deferred for MVP simplicity).

### Decision: Idempotency via client-provided keys
**Rationale**: Enables safe retries without server-side transaction tracking.
24-hour TTL balances storage cost with retry window.
**Alternatives considered**: Server-generated transaction IDs (rejected because
client retries would create duplicates).

### Decision: Background job for reservation expiry
**Rationale**: Prevents orphaned reservations from permanently locking funds.
5-second interval balances responsiveness with load.
**Alternatives considered**: Redis key expiry (rejected because we need to
update reservation status, not just delete).

## Best Practices and Patterns

- Use optimistic locking (version field) to prevent concurrent balance updates
  from causing inconsistencies.
- Always validate available balance (total minus reservations) before debit
  operations.
- Include full context in transaction metadata (tableId, handId, seatId) for
  audit queries and debugging.
- Use idempotency keys for all mutating operations to enable safe retries.
- Verify ledger checksum chain periodically via background job to detect
  corruption early.
- Implement graceful degradation: poker service should continue functioning
  if balance service is temporarily unavailable (with logged reconciliation).
- Keep reservation timeout short (30s default) to minimize fund lock duration.
- Use SHA-256 for ledger checksums - industry standard for integrity verification.

## Future Considerations

- **Optional “cash tracking” mode**: Represent real-world stakes out-of-band (no payment processing).
- **Multi-currency**: Support for multiple chip denominations or currencies.
- **Rate limiting**: Add rate limits to prevent abuse of deposit/withdraw
  endpoints.
- **Notifications**: Emit events when balance changes significantly for
  player alerts.
- **Reconciliation tools**: Admin endpoints for investigating and fixing
  discrepancies.
- **Horizontal scaling**: Shard by accountId for high-volume deployments.
