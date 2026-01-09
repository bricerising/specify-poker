import { markSeatDisconnected } from "../services/tableService";

const connections = new Map<string, string>();

export function registerConnection(connectionId: string, userId: string) {
  connections.set(connectionId, userId);
}

export function unregisterConnection(connectionId: string) {
  const userId = connections.get(connectionId);
  connections.delete(connectionId);
  if (userId) {
    markSeatDisconnected(userId);
  }
}
