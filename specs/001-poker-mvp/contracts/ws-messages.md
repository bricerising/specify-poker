# WebSocket Message Contracts

All messages are JSON objects with a `type` field.

## Connection/Auth

- WebSocket URL: `ws(s)://{host}/ws?token={jwt}`
- Connections without a valid `token` are closed with code `1008`.

## Client -> Server

- `SubscribeTable` { tableId }
- `UnsubscribeTable` { tableId }
- `ResyncTable` { tableId }
- `JoinSeat` { tableId, seatId }
- `LeaveTable` { tableId }
- `Action` { tableId, handId, action, amount? }
- `SubscribeChat` { tableId }
- `UnsubscribeChat` { tableId }
- `ChatSend` { tableId, message }

Notes:
- `action` is one of `Fold`, `Check`, `Call`, `Bet`, `Raise`.
- `amount` is only used for `Bet`/`Raise`.
- Chat subscription requires the user to be seated (active or spectator).

## Server -> Client

- `Welcome` { userId, connectionId }
- `Error` { code, message, correlationId? }
- `LobbyTablesUpdated` { tables[] }
- `TableSnapshot` { tableState }
- `TablePatch` { tableId, handId, patch }
- `HoleCards` { tableId, handId, seatId, cards: [string, string] }
- `ActionResult` { tableId, handId, accepted, reason? }
- `ChatSubscribed` { tableId }
- `ChatError` { tableId, reason }
- `ChatMessage` { tableId, message: { id, userId, nickname, text, ts } }
- `TimerUpdate` { tableId, handId, currentTurnSeat, deadlineTs }
- `HandEvent` { tableId, handId, event }

Notes:
- `LobbyTablesUpdated` is broadcast to all connected sockets when lobby data changes.
- `TableSnapshot` and `TablePatch` include a full table state payload (not a diff).
- Hand snapshots in `TableSnapshot`, `TablePatch`, and `HandEvent` are redacted:
  `holeCards` is `{}` and `deck` is `[]`.
- `HoleCards` is only sent to the owning seat and only for active seats.
- `ActionResult.tableId`/`handId` may be omitted when the table id is invalid.
- `ChatError.tableId` is `null` when the table id is invalid.

## Shared Payloads

`TableStateView` (used in `TableSnapshot` and `TablePatch.patch`):
- `tableId`, `name`, `ownerId`, `config`, `status`, `hand`, `version`
- `seats[]`: `TableSeatView` entries

`TableSeatView`:
- `seatId`, `userId`, `stack`, `status`
- `nickname?` (present when a profile is available)

## Error/Reason Codes

`Error.code`:
- `invalid_table`, `invalid_seat`

`ActionResult.reason`:
- `invalid_table`, `no_hand`, `not_seated`, `rate_limited`, `invalid_action`,
  `not_your_turn`, `seat_missing`, `seat_inactive`, `hand_complete`,
  `illegal_action`, `missing_amount`, `amount_too_small`, `amount_too_large`

`ChatError.reason`:
- `invalid_table`, `not_seated`, `muted`, `empty_message`, `message_too_long`, `rate_limited`
