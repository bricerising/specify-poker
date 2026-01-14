# WebSocket Message Contracts

All messages are JSON objects with a `type` field.

## Connection/Auth

- WebSocket URL: `ws(s)://{host}/ws?token={jwt}`
- Connections without a valid `token` are closed with code `1008`.

## Client -> Server

- `SubscribeTable` { tableId }  // spectator subscription (no seat)
- `UnsubscribeTable` { tableId }
- `ResyncTable` { tableId }
- `JoinSeat` { tableId, seatId }
- `LeaveTable` { tableId }
- `Action` { tableId, handId, action, amount? }
- `SubscribeChat` { tableId }
- `UnsubscribeChat` { tableId }
- `ChatSend` { tableId, message }

## Server -> Client

- `Welcome` { userId, connectionId }
- `Error` { code, message, correlationId? }
- `LobbyTablesUpdated` { tables[] }  // TableSummary entries include spectatorCount
  // “Lobby” here means the instance table index (not public matchmaking).
- `TableSnapshot` { tableState }
- `TablePatch` { tableId, handId, patch }
- `HoleCards` { tableId, handId, seatId, cards: [string, string] }
- `ActionResult` { tableId, handId, accepted, reason? }
- `ChatSubscribed` { tableId, history? }
- `ChatError` { tableId, reason }
- `ChatMessage` { tableId, message: { id, userId, nickname, text, ts } }
- `TimerUpdate` { tableId, handId, currentTurnSeat, deadlineTs }
- `HandEvent` { tableId, handId, event }
- `SpectatorJoined` { tableId, userId, nickname?, spectatorCount }
- `SpectatorLeft` { tableId, userId, spectatorCount }

## Shared Payloads

`TableStateView`:
- `tableId`, `name`, `ownerId`, `config`, `status`, `hand`, `version`
- `seats[]`: `TableSeatView` entries
- `spectators[]`: `SpectatorView` entries

`TableSeatView`:
- `seatId`, `userId`, `stack`, `status`
- `nickname?` (present when a profile is available)

`SpectatorView`:
- `userId`, `nickname?`, `status`
