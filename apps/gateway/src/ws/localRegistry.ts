import WebSocket from "ws";

type LocalConnection = {
  socket: WebSocket;
  userId: string;
  ip: string;
};

const localConnections = new Map<string, LocalConnection>();

export function registerLocalSocket(connectionId: string, socket: WebSocket, meta: { userId: string; ip: string }) {
  localConnections.set(connectionId, { socket, ...meta });
}

export function unregisterLocalSocket(connectionId: string) {
  localConnections.delete(connectionId);
}

export function getLocalSocket(connectionId: string) {
  return localConnections.get(connectionId)?.socket;
}

export function getLocalConnectionMeta(connectionId: string) {
  return localConnections.get(connectionId);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sendToLocal(connectionId: string, message: unknown) {
  const entry = localConnections.get(connectionId);
  const socket = entry?.socket;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}
