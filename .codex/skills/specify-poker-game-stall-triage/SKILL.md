---
name: specify-poker-game-stall-triage
description: Debug stalled poker hands and table UI issues in specify-poker (stuck on preflop, turn never advances, hand timers not firing, players can't see their own hole cards, duplicate seating, invalid hand.turn/seat status) using Gateway APIs, Game Service state, and docker-compose logs.
---

# Specify Poker Game Stall Triage

## Quick Checks (Fast Signal)

1. Fetch state from Gateway:
   - `curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/tables/$TABLE_ID/state"`
2. Validate invariants:
   - `state.hand` exists once 2+ players are seated.
   - `state.hand.turn` points at a seat with `user_id` and `status: "ACTIVE"`.
   - A single `user_id` appears in at most one seat (no duplicate seating).
3. If the UI shows “Watching” behavior (no actions / no hole cards), confirm you’re seated:
   - Your `user_id` should appear in `state.seats[*].user_id`.

## Generate a Local Dev Token (Compose / E2E)

The docker-compose stack accepts HS256 tokens signed with `default-secret` (matching Playwright helpers).

Generate a token:

```bash
TOKEN="$(
  USER_ID="debug-user" NICKNAME="Debug" JWT_SECRET="default-secret" node - <<'NODE'
const crypto = require("crypto");
function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function sign(data, secret) {
  return base64Url(crypto.createHmac("sha256", secret).update(data).digest());
}
const userId = process.env.USER_ID ?? "debug-user";
const nickname = process.env.NICKNAME ?? "Debug";
const secret = process.env.JWT_SECRET ?? "default-secret";
const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = base64Url(JSON.stringify({
  sub: userId,
  nickname,
  iss: "poker-gateway",
  aud: "poker-ui",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
}));
console.log(`${header}.${payload}.${sign(`${header}.${payload}`, secret)}`);
NODE
)"
```

## Symptom → Likely Cause Map

- Stuck on `PREFLOP` / “Current Turn” is an empty seat:
  - `hand.turn` drifted to an `EMPTY`/inactive seat (or the timer never fired).
  - Check Game Service turn repair + timer scheduling in `apps/game/src/services/tableService.ts`.
- Same player appears in multiple seats:
  - Duplicate seating wasn’t blocked; action routing can hit the “wrong” seat.
  - Confirm Game Service rejects second seat join with `ALREADY_SEATED`.
- Player can’t see their own hole cards:
  - UI thinks they’re spectating (no `seatId`) even though the server shows them seated.
  - Confirm UI infers your seat from the JWT `sub` in `apps/ui/src/state/tableStore.ts` and then fetches hole cards.

## Logs (When You Need Root Cause)

- Game Service: `docker compose logs --since 10m game | rg 'turn\\.repair|NOT_YOUR_TURN|NO_HAND_IN_PROGRESS'`
- Gateway boundary: `docker compose logs --since 10m gateway | rg '/api/tables/|SubmitAction|JoinSeat'`
- For traceId correlation across services, use `.codex/skills/specify-poker-observability-triage/SKILL.md`.

## Regression Tests

- Run just the “duplicate seating” rule:
  - `PLAYWRIGHT_EXTERNAL=1 npm --prefix apps/ui run test:e2e -- tests/e2e/gameplay-rules.spec.ts -g "rejects joining multiple seats"`
