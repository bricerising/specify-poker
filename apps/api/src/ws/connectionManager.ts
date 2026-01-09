import { markSeatDisconnected } from "../services/tableService";

const connections = new Map<string, string>();

export function registerConnection(connectionId: string, userId: string) {
  connections.set(connectionId, userId);
}

export async function unregisterConnection(connectionId: string) {
  const userId = connections.get(connectionId);
  connections.delete(connectionId);
  if (userId) {
    await markSeatDisconnected(userId);
  }
}
