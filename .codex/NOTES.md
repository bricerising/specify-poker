# Agent Notes (Codex)

## 2026-01-26 — Readability patterns applied

### gRPC unary handlers: Template Method wrapper

Repeated `Date.now()` + `try/catch` + `recordGrpcRequest()` + `logger.error()` blocks make handler modules noisy.
We refactored two services to use small higher-order wrappers (Template Method) so each RPC reads like “parse → call service → map response”.

- Player: `apps/player/src/api/grpc/handlers.ts` uses `createUnaryHandler()` with optional `onSuccess`/`onError` hooks.
- Notify: `apps/notify/src/api/grpc/handlers.ts` uses `createUnaryHandler()` with:
  - `statusFromResponse` to mark `"error"` when `{ ok: false }` is returned (not only on exceptions)
  - optional `errorResponse` to keep “business error” responses as `callback(null, { ok: false, error })` instead of gRPC-level errors.

Existing examples in the repo:

- Balance: `apps/balance/src/api/grpc/handlers.ts` has a local `handleUnary()` wrapper.
- Game: `apps/game/src/api/grpc/handlers/index.ts` has a local `handleUnary()` wrapper.

### Pitfalls / gotchas

- Preserve response shapes exactly (some tests assert `toHaveBeenCalledWith(null, { ok: true })`; adding extra keys breaks them).
- Proto-loader casing differs by service options:
  - Some services keep method names like `CreateTable`/`JoinSeat`
  - Others camelCase handlers (e.g. `registerSubscription`) while still recording metrics with `"RegisterSubscription"`.

