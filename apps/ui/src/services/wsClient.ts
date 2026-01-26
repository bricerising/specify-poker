import { recordWebSocketMessage } from "../observability/otel";

export function isStaleVersion(currentVersion: number | null, incomingVersion: number) {
  if (currentVersion === null || currentVersion < 0) {
    return false;
  }
  return incomingVersion <= currentVersion;
}

export function shouldResync(currentVersion: number | null, incomingVersion: number) {
  if (currentVersion === null || currentVersion < 0) {
    return false;
  }
  return incomingVersion > currentVersion + 1;
}

export function requestResync(socket: WebSocket | null, tableId: string) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  recordWebSocketMessage("ResyncTable", "sent", tableId);

  socket.send(JSON.stringify({ type: "ResyncTable", tableId }));
}
