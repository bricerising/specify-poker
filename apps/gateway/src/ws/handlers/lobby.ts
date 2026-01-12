import WebSocket from "ws";
import { gameClient } from "../../grpc/clients";
import { WsPubSubMessage } from "../pubsub";
import { subscribeToChannel, unsubscribeFromChannel, getSubscribers } from "../subscriptions";
import { sendToLocal } from "../localRegistry";
import { broadcastToChannel } from "../../services/broadcastService";

const LOBBY_CHANNEL = "lobby";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _broadcast(tables: unknown[]) {
  await broadcastToChannel(LOBBY_CHANNEL, { type: "LobbyTablesUpdated", tables });
}

export async function handleLobbyPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "lobby") {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = (message.payload as any).tables;
  if (tables) {
    const subscribers = await getSubscribers(LOBBY_CHANNEL);
    for (const connId of subscribers) {
      sendToLocal(connId, { type: "LobbyTablesUpdated", tables });
    }
  }
}

export async function attachLobbyHub(socket: WebSocket, connectionId: string) {
  await subscribeToChannel(connectionId, LOBBY_CHANNEL);

  // Send initial snapshot
  gameClient.ListTables({}, (err, response) => {
    if (!err && response && response.tables) {
      sendToLocal(connectionId, { type: "LobbyTablesUpdated", tables: response.tables });
    }
  });

  socket.on("close", async () => {
    await unsubscribeFromChannel(connectionId, LOBBY_CHANNEL);
  });
}
