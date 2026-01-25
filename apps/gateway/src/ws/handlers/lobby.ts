import WebSocket from "ws";
import { gameClient } from "../../grpc/clients";
import { WsPubSubMessage } from "../pubsub";
import { subscribeToChannel, unsubscribeFromChannel, getSubscribers } from "../subscriptions";
import { sendToLocal } from "../localRegistry";
import { toWireTableSummary } from "../transforms/gameWire";

const LOBBY_CHANNEL = "lobby";

export async function handleLobbyPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "lobby") {
    return;
  }
  const tables = Array.isArray(message.payload.tables) ? message.payload.tables : null;
  if (!tables) {
    return;
  }
  const normalizedTables = tables.map(toWireTableSummary);
  const subscribers = await getSubscribers(LOBBY_CHANNEL);
  for (const connId of subscribers) {
    sendToLocal(connId, { type: "LobbyTablesUpdated", tables: normalizedTables });
  }
}

export async function attachLobbyHub(socket: WebSocket, connectionId: string) {
  await subscribeToChannel(connectionId, LOBBY_CHANNEL);

  // Send initial snapshot
  gameClient.ListTables({}, (err, response) => {
    if (!err && response && response.tables) {
      sendToLocal(connectionId, { type: "LobbyTablesUpdated", tables: response.tables.map(toWireTableSummary) });
    }
  });

  socket.on("close", async () => {
    await unsubscribeFromChannel(connectionId, LOBBY_CHANNEL);
  });
}
