export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  connectedAt: string;
}

const connections = new Map<string, ConnectionInfo>();

export function registerConnection(info: ConnectionInfo) {
  connections.set(info.connectionId, info);
}

export function unregisterConnection(connectionId: string) {
  connections.delete(connectionId);
}

export function getActiveConnections() {
  return Array.from(connections.values());
}

export function resetConnections() {
  connections.clear();
}
