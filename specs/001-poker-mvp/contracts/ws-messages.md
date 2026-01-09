# WebSocket Message Contracts

## Client -> Server

- `SubscribeTable` { tableId }
- `UnsubscribeTable` { tableId }
- `JoinSeat` { tableId, seatId }
- `LeaveTable` { tableId }
- `Action` { tableId, handId, action: Fold|Check|Call|Bet|Raise, amount? }
- `ChatSend` { tableId, message }
- `Ping` { ts }

## Server -> Client

- `Welcome` { userId, connectionId }
- `Error` { code, message, correlationId? }
- `LobbyTablesUpdated` { tables[] }
- `TableSnapshot` { tableState }
- `TablePatch` { tableId, handId, patch }
- `ActionResult` { tableId, handId, accepted, reason? }
- `ChatMessage` { tableId, userId, message, ts }
- `TimerUpdate` { tableId, handId, currentTurnSeat, deadlineTs }
- `HandEvent` { tableId, handId, event }
