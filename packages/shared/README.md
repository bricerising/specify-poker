# `@specify-poker/shared`

Internal “shared” utilities for the specify-poker monorepo.

This package is intentionally a mix of:

- **Domain-level contracts** (shared Zod schemas + TypeScript interfaces used by UI + services)
- **Runtime utilities** (Result type, config/env helpers, retry/backoff)
- **Service plumbing** (graceful shutdown helpers, gRPC helpers, Redis helpers, Prometheus metrics server)

It is **private** (not published to npm). It is consumed via npm workspaces.

---

## What’s in here (at a glance)

### Supported entrypoints

This package uses the Node `exports` field. Only these import paths are supported:

| Import path | Contents | Notes |
|---|---|---|
| `@specify-poker/shared` | Most shared utilities (schemas, types, lifecycle, gRPC, etc.) | Node-focused; avoid in browser code unless you know bundling is safe |
| `@specify-poker/shared/schemas` | Zod schemas + default config helpers | Safe for browser usage |
| `@specify-poker/shared/pipeline` | Small functional/pipeline utilities | Safe for browser usage |
| `@specify-poker/shared/redis` | Redis client manager + stream consumer helpers | Node-only (depends on `redis`) |

If you need something not exposed as an entrypoint, **import it from the main entry** (`@specify-poker/shared`) instead of deep-importing internal files.

### Directory layout

```text
packages/shared/
  src/                 # Source of truth
  dist/                # Build output (ESM + dist/cjs for CommonJS consumers)
  tests/               # Vitest tests (repo-level runner discovers these)
  tsconfig.json        # ESM build
  tsconfig.cjs.json    # CommonJS build into dist/cjs
```

### Consuming from a workspace package

In this monorepo, you typically depend on this package via npm workspaces.

Recommended `package.json` entry:

```json
{
  "dependencies": {
    "@specify-poker/shared": "workspace:*"
  }
}
```

Notes:

- `@specify-poker/shared` has a direct dependency on `zod`.
- The Redis entrypoint (`@specify-poker/shared/redis`) expects `redis` to be available (it’s a peer dependency here).

---

## Domain contracts

### `schemas/` (Zod)

File: `src/schemas/index.ts`

These schemas are the **runtime source of truth** for validating and coercing payloads shared across services and the UI. They typically back:

- HTTP route input validation (gateway)
- WebSocket message validation/decoding (gateway + UI)
- Data contracts used in tests/e2e

Key exports:

- `schemaVersion`: current schema package version string (`"0.1.0"`).
- Table config:
  - `bettingStructureSchema` (`"NoLimit"`)
  - `tableConfigSchema`: validates a fully-specified table config and enforces invariants:
    - `bigBlind >= 2 * smallBlind`
    - `ante` is `null|undefined` or `< smallBlind`
  - `defaultTableConfig`: default values used across the system
  - `tableConfigInputSchema`: accepts partial input, fills defaults, derives `bigBlind` from `smallBlind` when missing, then pipes to `tableConfigSchema`
- Common coercions for gateway inputs:
  - `seatIdSchema`: accepts `"3"` and coerces to `3`, then enforces `0..8`
  - `buyInAmountSchema`: accepts `"200"` and coerces to `200`, then enforces integer >= 0
- HTTP request payloads:
  - `tableCreateRequestInputSchema`
  - `tableJoinSeatRequestSchema`
  - `moderationRequestSchema`
- Public “view models”:
  - `userProfileSchema`
  - `tableSummarySchema`
  - `tableStateViewSchema` (+ nested seat/hand/pot/action schemas)
- WebSocket messages:
  - `wsClientMessageSchema`: discriminated union for client → server messages
  - `wsServerMessageSchema`: discriminated union for server → client messages
  - `wsActionSchema`: enum of `Fold | Check | Call | Bet | Raise`

Practical pattern (HTTP):

```ts
import { tableCreateRequestInputSchema } from '@specify-poker/shared/schemas';

const parsed = tableCreateRequestInputSchema.parse(req.body);
// parsed.config is now fully-populated and validated.
```

Practical pattern (WS):

```ts
import { wsClientMessageSchema } from '@specify-poker/shared/schemas';

const msg = wsClientMessageSchema.parse(JSON.parse(raw));
switch (msg.type) {
  case 'Authenticate':
  case 'SubscribeTable':
    // ...
}
```

### `types/` (TypeScript interfaces)

File: `src/types/index.ts`

These are **compile-time-only** contracts that mirror the domain concepts in `schemas/`.

Key exports:

- Identifiers:
  - `TableId`, `UserId`
- TypeScript exhaustiveness helpers:
  - `assertNever(value, message?)` (throws at runtime; great for `switch` defaults)
  - `exhaustiveCheck(value)` (type-only check; no runtime throw)
- Domain config/contracts:
  - `BettingStructure` (currently only `'NoLimit'`)
  - `UserProfile`
  - `TableConfig`
  - `TableSummary`
  - `TableCreateRequest`, `TableJoinRequest`, `TableJoinResponse`
  - `ModerationRequest`

Guideline: prefer **schemas** at service boundaries (HTTP/WS/gRPC ingress), and use **types** inside business logic for readability.

---

## General utilities

### `config/` (env parsing + typed config builder)

File: `src/config/index.ts`

Small helpers for building “service config” objects from environment variables.

Key exports:

- Env readers:
  - `readIntEnv(env, keys, fallback, options?)`
  - `readStringEnv(env, keys, fallback, options?)`
  - `readNullableStringEnv(env, keys, fallback?, options?)`
- Builder:
  - `ConfigBuilder`
  - `createConfigBuilder(env?)`

Notes:

- `keys` can be a string or a list of strings (the first valid key wins).
- Integer parsing is strict (`Number.isInteger`) and supports min/max bounds.
- String parsing trims by default and can be configured to throw on empty values.

Pattern:

```ts
import { createConfigBuilder } from '@specify-poker/shared';

const config = createConfigBuilder(process.env)
  .int('port', ['PORT', 'HTTP_PORT'], 4000, { min: 1, max: 65535 })
  .nullableString('redisUrl', 'REDIS_URL')
  .build();
```

### `result/` (typed Result)

File: `src/result/index.ts`

A small `Result<T, E>` discriminated union for explicit success/failure returns without exceptions.

Key exports:

- `Result<T, E>`, `Ok<T>`, `Err<E>`
- Constructors/guards: `ok`, `err`, `isOk`, `isErr`
- Transforms: `mapResult`, `mapError`, `flatMap`
- Unwrap: `unwrap`, `unwrapOr`
- Exception interop: `tryCatch`, `tryCatchSync`

Use this when:

- an operation can fail as part of normal control-flow (e.g. validation, “not found”)
- you want callers to *handle* failure instead of relying on try/catch

### `errors/ensureError`

File: `src/errors/ensureError.ts`

Normalizes unknown thrown values into an `Error`:

- `Error` → unchanged
- `string` → `new Error(string)`
- anything else → `new Error(fallbackMessage, { cause: value })`

This is useful in generic `catch (err: unknown)` blocks before logging or mapping errors.

### `retry/` (backoff strategies)

File: `src/retry/index.ts`

Pure retry strategy helpers (no I/O):

- `exponentialBackoff({ baseMs, maxMs, maxAttempts, multiplier })`
- `linearBackoff({ initialMs, incrementMs, maxMs, maxAttempts })`
- `constantBackoff({ delayMs, maxAttempts })`
- `withJitter(strategy, jitterFactor?)` to add ± jitter to delays

These return a `RetryStrategy` with:

- `getDelayMs(attempt)` (attempt is 1-indexed)
- `shouldRetry(attempt)`

---

## Pipeline / composition helpers

Entrypoint: `@specify-poker/shared/pipeline`

These utilities show up throughout the codebase for “pipeline-shaped” problems:

- request/command chains (game table actions)
- event dispatch (event consumer / UI reducers)
- middleware/interceptors (gRPC + generic async handlers)

### `composeAsyncChain` / `composeAsyncChainWithDeps`

File: `src/pipeline/asyncChain.ts`

Implements an **async Chain of Responsibility**:

- each handler receives `(ctx, next)`
- handlers can mutate context and either call `next()` or short-circuit
- calling `next()` more than once throws `async_chain.next_called_multiple_times`

### `chainAsyncInterceptors`

File: `src/pipeline/chainAsyncInterceptors.ts`

Composes interceptors (middleware) around an async handler:

- interceptors run in array order (first interceptor runs first)
- any interceptor may short-circuit by not calling `next`

This is used directly and also as the foundation for gRPC unary interceptors.

### `dispatchByType` / `dispatchByTypeNoCtx`

File: `src/pipeline/dispatchByType.ts`

Typed dispatch for discriminated unions that have a `type` field:

- `dispatchByType(handlers, ctx, event)`
- `dispatchByTypeNoCtx(handlers, event)`

There is no runtime fallback; a missing handler will throw at call-time. The intent is that the handler map is exhaustive via TypeScript.

---

## Proxy helper

### `createBoundTargetProxy`

File: `src/proxy/boundTargetProxy.ts`

Creates a Proxy that always delegates reads to the **latest** target returned by `getTarget()`:

- function properties are bound to the target to preserve `this`
- the proxy is explicitly non-thenable to avoid `await proxy` footguns

This is a building block for “lazy” and “swappable” clients (it’s used by the gRPC and Redis proxies in this package).

---

## Lifecycle + process helpers

These are used heavily in backend services for safe start/stop and “boring reliability”.

### `createShutdownManager`

File: `src/lifecycle/shutdown.ts`

Collects shutdown actions and runs them **in reverse registration order** (LIFO).

Properties:

- best-effort: if one action throws, remaining actions still run
- idempotent: `run()` is safe to call multiple times (it reuses the same promise)

### `runServiceMain`

File: `src/lifecycle/serviceRunner.ts`

Standard service main-loop wrapper:

- runs `main()`
- listens for `SIGINT`/`SIGTERM` (configurable)
- listens for `uncaughtException` and `unhandledRejection`
- calls `shutdown()` exactly once, then exits with code (`fatalExitCode` default is `1`)

Typical usage is pairing this with a `ShutdownManager` and registering resource cleanup there.

### `createPeriodicTask`

File: `src/lifecycle/periodicTask.ts`

Periodic async job runner that:

- optionally runs immediately (`runOnStart`)
- never runs concurrently (it skips triggers while a run is in-flight)
- schedules the next run **after** a run finishes (interval is “delay after completion”)
- provides an `AbortSignal` to the task so it can stop quickly

### `TimeoutRegistry`

File: `src/lifecycle/timeoutRegistry.ts`

A keyed registry of `setTimeout` handles:

- `set(key, timeout)` clears any existing timeout for that key
- `delete(key)` clears and removes
- `clear()` clears all

Useful for per-table/per-user timers where you want overwrite semantics without leaks.

### `createLazyValue` / `createDisposableLazyValue`

Files:

- `src/lifecycle/lazyValue.ts`
- `src/lifecycle/disposableLazyValue.ts`

`createLazyValue(create)` caches a lazily created value until `reset()`.

`createDisposableLazyValue(create, disposeValue)` adds `dispose()` which:

- calls `disposeValue` on the cached value if present
- resets the cache even if disposal throws (best-effort cleanup)

Common use: lazily creating gRPC clients, Redis clients, etc.

### `createAsyncLifecycle`

File: `src/lifecycle/asyncLifecycle.ts`

An async start/stop state machine that makes `start()`/`stop()` safe under concurrency:

- multiple concurrent `start()` calls share the same in-flight start
- `stop()` waits for `start()` to finish before stopping
- handles `start()` failures by returning to `stopped`

---

## gRPC helpers (grpc-js friendly, minimal dependencies)

The goal of these helpers is to make grpc-js integration:

- promise-friendly on the client
- interceptor-friendly and consistent on the server
- less footgun-y around missing handlers, cancellation, and error mapping

### Client-side unary calls

Files:

- `src/grpc/call.ts`
- `src/grpc/unaryCallProxy.ts`
- `src/grpc/unaryCallResultProxy.ts`

#### `unaryCall`

Wraps a unary callback-style client method into a `Promise<Response>` and supports:

- `AbortSignal` cancellation (calls `cancel()` on the underlying call if available)
- timeouts via `timeoutMs` (treated as AbortError)

#### `unaryCallResult`

Same as `unaryCall`, but returns a `Result<Response, unknown>` instead of throwing.

#### `createUnaryCallProxy`

Creates a non-thenable Proxy over a grpc-js client so that:

- `proxy.Method(request, options?)` returns `Promise<Response>`
- method `this` binding is preserved
- calling a non-method property rejects with `unary_call_proxy.non_function_property:*`

#### `createUnaryCallResultProxy`

Same, but returns `Promise<Result<Response, unknown>>` and never throws for RPC failures.

#### Lazy/swappable variants

- `createLazyUnaryCallProxy(getClient)`
- `createLazyUnaryCallResultProxy(getClient)`

These combine a “latest target” proxy with the unary-call proxies. They’re useful in tests and for systems where clients are recreated on config reload.

### Server-side unary handlers + interceptors

File: `src/grpc/unary.ts`

The core primitive is `createUnaryHandler(...)`, which helps implement grpc-js unary handlers with:

- a typed `(context) => response` handler
- optional interceptors
- consistent error conversion to callback error objects

Key exports:

- Types: `UnaryCall`, `UnaryCallback`, `UnaryContext`, `RequestHandler`, `UnaryInterceptor`
- Composition: `chainUnaryInterceptors` (built on `chainAsyncInterceptors`)
- Interceptors:
  - `withUnaryHooks` (onSuccess/onError callbacks)
  - `withUnaryTiming` (record duration and status)
  - `withUnaryErrorHandling` (log + map error to service error)
  - `withUnaryErrorResponse` (convert errors into success responses)
- Handler factory: `createUnaryHandler`

### Proto loading + server lifecycle

Files:

- `src/grpc/clientFactory.ts`
- `src/grpc/serverLifecycle.ts`
- `src/grpc/serviceRegistration.ts`

#### `createGrpcServiceClientFactory`

Builds a small factory that:

- loads the proto definition (via `@grpc/proto-loader` and `@grpc/grpc-js`) lazily
- caches the service constructor after the first load
- constructs concrete client instances on demand

#### `createGrpcServiceClientFactoryBuilder`

Builds an Abstract Factory for `createGrpcServiceClientFactory(...)` that:

- shares `grpc`, `protoLoader`, and default `protoLoaderOptions` across many services
- optionally allows per-service `protoLoaderOptions` overrides

#### `createGrpcServerLifecycle`

Facade for grpc server setup:

- loads protos
- registers services via a provided `register(server, proto)` callback
- binds to `host:port` and optionally starts the server after bind
- exposes a stable `start(): Promise<void>` / `stop(): void` API

It includes a “generation” guard so that calling `stop()` during an in-flight `start()` does not leak a running server.

#### `addGrpcService`

Facade around `server.addService(...)` that validates handler completeness.

grpc-js matches handlers by either:

- protobuf method name (e.g. `GetProfile`)
- `originalName` (e.g. `getProfile`)

`addGrpcService(...)` checks both and throws `GrpcServiceRegistrationError` listing missing handlers before registering.

### gRPC error helpers

Files:

- `src/grpc/serviceError.ts`
- `src/grpc/closeClient.ts`

#### `createGrpcServiceError` / `asGrpcServiceError`

Helpers for producing and normalizing grpc-style errors with a numeric `code` and `details`.

This package does not depend on grpc-js; you typically supply numeric codes from `@grpc/grpc-js` (e.g. `status.NOT_FOUND`).

#### `closeGrpcClient`

Best-effort close for grpc-js clients using duck-typing:

- prefers `client.close()`
- otherwise tries `client.getChannel().close()`

This is helpful because many codebases type service clients as “RPC-method-only” interfaces and lose the `close()` method in types.

---

## Auth / JWT helpers

Files:

- `src/auth/keycloakKeys.ts`
- `src/auth/jwtVerification.ts`
- `src/auth/jwtKid.ts`

These helpers exist to keep Keycloak/JWT verification logic consistent across services.

### `createKeycloakKeyProvider`

Creates a key provider that can fetch and cache Keycloak verification material:

- realm public key (`GET /realms/:realm`)
- JWKS certificates (`GET /realms/:realm/protocol/openid-connect/certs`) by `kid`

It caches values and also deduplicates concurrent in-flight fetches.

Key exports:

- `createKeycloakKeyProvider({ keycloakUrl, realm, timeoutMs?, fetch? })`
- `formatPublicKeyPem(...)`, `formatCertificatePem(...)`
- Types: `KeycloakKeyProvider`, `CreateKeycloakKeyProviderOptions`

### `readJwtHeaderKid`

Best-effort reader for a JWT header `kid`:

- decodes the JWT header segment (base64url)
- parses JSON
- returns `header.kid` or `null`

This does **not** validate the token.

### `resolveJwtVerificationMaterial`

Chooses which key + algorithms to use when verifying JWTs.

Key export:

- `resolveJwtVerificationMaterial({ keyProvider, kid?, publicKeyPem?, hs256Secret? })`

Resolution order:

1. If `hs256Secret` is present and neither `publicKeyPem` nor `kid` is present → `{ algorithms: ['HS256'] }`
2. Else if `publicKeyPem` is present → `{ algorithms: ['RS256'] }`
3. Else if `kid` is present → fetch JWKS certificate PEM for that `kid` → `{ algorithms: ['RS256'] }`
4. Else → fetch realm public key PEM → `{ algorithms: ['RS256'] }`

This is designed for services that support both “local/dev HS256” and “production RS256 via Keycloak”.

---

## Postgres helpers

Entrypoint: `@specify-poker/shared/pg`

### `createPgPoolManager`

File: `src/pg/pgPoolManager.ts`

Manages a Postgres pool with:

- lazy initialization
- pool-level error logging hooks (when supported)
- idempotent shutdown via `close()` / `end()`

API highlights:

- `isInitialized()`
- `query(text, params?)`
- `connect()`
- `close()` / `end()`

---

## Redis helpers

Entrypoint: `@specify-poker/shared/redis`

### `createRedisClientManager`

File: `src/redis/redisClientManager.ts`

Manages a redis client with:

- optional enablement (`url: string | null`)
- a standard client + a “blocking” client (for blocking commands / streams)
- error logging hooks
- graceful shutdown via `close()`

API highlights:

- `isEnabled()`
- `getClient()` / `getBlockingClient()` (throws if `url` is null)
- `getClientOrNull()` / `getBlockingClientOrNull()` (logs and returns `null` on connect failure)
- `close()` (idempotent)

### `runRedisStreamConsumer`

File: `src/redis/streamConsumer.ts`

An opinionated Redis Streams consumer loop using `XREADGROUP`:

- ensures a consumer group exists (ignores BUSYGROUP by default)
- blocks for `blockMs` and reads up to `readCount`
- calls `onMessage({ id, fields })` for each message
- acks messages based on `shouldAck` (defaults to “always ack”)
- retries on client/group/read/ack errors with `retryMs`
- stops cleanly when the provided `AbortSignal` is aborted

### `createRedisStreamConsumerLifecycle`

File: `src/redis/streamConsumerLifecycle.ts`

A small facade around `runRedisStreamConsumer` that:

- exposes `start()` / `stop()` / `isRunning()`
- manages an internal `AbortController`
- optionally calls `closeClient()` during `stop()` (useful for dedicated consumer redis managers)

### `createAsyncMethodProxy`

File: `src/proxy/asyncMethodProxy.ts`

Creates a non-thenable proxy that:

- waits for an async `getTarget()` per call
- then calls the method on the resolved target

This is useful for adapting “client is created asynchronously” patterns into a synchronous-feeling method surface.

---

## Small HTTP / metrics helpers

### `closeHttpServer`

File: `src/http/closeHttpServer.ts`

Promise wrapper around `server.close(...)` that also handles Node’s
`ERR_SERVER_NOT_RUNNING` as a no-op.

### `startPrometheusMetricsServer`

File: `src/observability/metricsServer.ts`

A tiny HTTP server for exposing Prometheus metrics from a `prom-client`-style registry:

- serves `/metrics` by default (configurable `path`)
- uses `registry.contentType`
- supports async `registry.metrics()`
- logs on listen and logs errors on render failure

---

## Observer helper

### `createSubject`

File: `src/observer/index.ts`

A minimal typed Subject/Observer implementation:

- `subscribe(observer)` returns `unsubscribe()`
- `notify(event)` awaits all observers (`Promise.allSettled`)
- observer errors are caught and routed to `onError` (default is `console.error`)
- `size()` reports current subscriber count

---

## Protobuf Struct helpers

File: `src/protobuf/struct.ts`

Helpers to convert between plain JS objects and a minimal representation of `google.protobuf.Struct`:

- Encode:
  - `toStruct(obj)`, `toStructFields(obj)`, `toStructValue(value)`
- Decode:
  - `decodeStructLike(payload)` (accepts either `{ fields: ... }` or a plain object)
  - `fromStruct(struct)`, `fromStructValue(value)`

This is used when services need to pass “generic structured metadata” through protobuf boundaries.

---

## Building and testing

From repo root:

- Build this package: `npm -w @specify-poker/shared run build`
- Run the repo test suite (includes this package): `npm test`

`packages/shared/dist/` is generated by the build and is not the source of truth; edit `packages/shared/src/` instead.
