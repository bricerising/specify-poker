import WebSocket from "ws";

import { onLobbyUpdate } from "../services/lobbyEvents";
import { listTables } from "../services/tableRegistry";
import { TableSummary } from "../services/tableTypes";
import { WsPubSubMessage, publishLobbyEvent } from "./pubsub";

interface LobbyConnection {
  socket: WebSocket;
  connectionId: string;
}

const clients = new Map<string, LobbyConnection>();
let initialized = false;

function send(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastLocal(tables: TableSummary[]) {
  for (const client of clients.values()) {
    send(client.socket, { type: "LobbyTablesUpdated", tables });
  }
}

async function broadcastLobbyTables(tables?: TableSummary[]) {
  const payload = tables ?? (await listTables());
  broadcastLocal(payload);
  await publishLobbyEvent(payload);
}

export function initLobbyHub() {
  if (initialized) {
    return;
  }
  onLobbyUpdate(() => {
    void broadcastLobbyTables();
  });
  initialized = true;
}

export function handleLobbyPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "lobby") {
    return;
  }
  const tables = message.payload.tables as TableSummary[] | undefined;
  if (tables) {
    broadcastLocal(tables);
    return;
  }
  void broadcastLobbyTables();
}

export function attachLobbyHub(socket: WebSocket, connectionId: string) {
  clients.set(connectionId, { socket, connectionId });
  socket.on("close", () => {
    clients.delete(connectionId);
  });
}
