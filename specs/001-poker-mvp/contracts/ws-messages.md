# WebSocket Message Contracts

## Client -> Server

- `SubscribeTable` { tableId }
- `UnsubscribeTable` { tableId }
- `ResyncTable` { tableId }
- `JoinSeat` { tableId, seatId }
- `LeaveTable` { tableId }
- `Action` { tableId, handId, action: Fold|Check|Call|Bet|Raise, amount? }
- `SubscribeChat` { tableId }
- `UnsubscribeChat` { tableId }
- `ChatSend` { tableId, message }
- `Ping` { ts }

## Server -> Client

- `Welcome` { userId, connectionId }
- `Error` { code, message, correlationId? }
- `LobbyTablesUpdated` { tables[] }
- `TableSnapshot` { tableState }
- `TablePatch` { tableId, handId, patch }
- `ActionResult` { tableId, handId, accepted, reason? }
- `ChatSubscribed` { tableId }
- `ChatError` { tableId, reason }
- `ChatMessage` { tableId, message: { id, userId, text, ts } }
- `TimerUpdate` { tableId, handId, currentTurnSeat, deadlineTs }
- `HandEvent` { tableId, handId, event }
