---
name: flatten-branching-typescript
description: Reduce branching and nested control flow in TypeScript while preserving behavior; use when asked to simplify, flatten, or refactor conditional logic for testability/readability.
---

# Flatten Branching in TypeScript

## Workflow

1. Identify nested conditionals, repeated guards, and duplicated mapping/serialization logic.
2. Use early return/continue to flatten nested blocks.
3. Extract small helpers for repeated conversions (timestamps, DTO mapping, error handling).
4. Replace repeated boolean gates with named flags (e.g., `shouldRedact`, `isUnauthorized`).
5. Use `switch` for event-type fanout and delegate to small helpers where possible.
6. Build arrays with optional entries plus `filter(Boolean)` to avoid conditional pushes.
7. Keep behavior identical: compare inputs/outputs and error messages before and after.
8. Run relevant tests; add or update tests only if behavior would otherwise be ambiguous.
9. Prefer small loader helpers that return `{ table, state } | null` to collapse repeated null checks.
10. Use a shared unary wrapper for gRPC handlers to eliminate per-handler try/catch blocks.

## Patterns

- **Early return**
  - Replace nested `if` blocks with guard clauses.

- **Shared helpers**
  - `mapEventToProto`, `timestampToDate`, `toTimestamp`, `mapCursorToProto`.

- **Centralized error handling**
  - One `handleError` for gRPC handlers to reduce per-handler branching.

- **Named boolean gates**
  - `const shouldRedact = !isOperator && requesterUserId;`

- **Optional list entries**
  - Example:
    ```ts
    const streamIds = ["all", `table:${id}`, handId ? `hand:${handId}` : null].filter(Boolean);
    ```

- **Action fanout helpers**
  - Use a `switch` with helper functions that return flags (e.g., `{ resetActedSeats }`) to reduce nested action logic.

- **Publish helpers**
  - Create a `publishTableAndLobby` helper to avoid repeating state + lobby broadcasts.

## Guardrails

- Preserve error strings and error codes.
- Avoid changing payload shapes or field naming.
- Keep logging semantics (no new logs, no removed logs).
