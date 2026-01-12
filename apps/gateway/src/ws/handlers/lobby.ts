import WebSocket from "ws";
import { gameClient } from "../../grpc/clients";
import { WsPubSubMessage } from "../pubsub";
import { subscribeToChannel, unsubscribeFromChannel, getSubscribers } from "../subscriptions";
import { sendToLocal } from "../localRegistry";
import { broadcastToChannel } from "../../services/broadcastService";
import logger from "../../observability/logger";

const LOBBY_CHANNEL = "lobby";

async function broadcast(tables: any[]) {
    await broadcastToChannel(LOBBY_CHANNEL, { type: "LobbyTablesUpdated", tables });
}

export async function handleLobbyPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "lobby") {
    return;
  }
  const tables = message.payload.tables as any[] | undefined;
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
  gameClient.ListTables({}, (err: any, response: any) => {
    if (!err && response && response.tables) {
        sendToLocal(connectionId, { type: "LobbyTablesUpdated", tables: response.tables });
    }
  });

  socket.on("close", async () => {
    await unsubscribeFromChannel(connectionId, LOBBY_CHANNEL);
  });
}
