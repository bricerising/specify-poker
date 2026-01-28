import WebSocket from "ws";
import { grpc } from "../../grpc/unaryClients";
import { WsPubSubMessage } from "../pubsub";
import { subscribeToChannel, unsubscribeFromChannel } from "../subscriptions";
import { sendToLocal } from "../localRegistry";
import { toWireTableSummary } from "../transforms/gameWire";
import logger from "../../observability/logger";
import { safeAsyncHandler } from "../../utils/safeAsyncHandler";
import { deliverToSubscribers } from "../delivery";

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
  await deliverToSubscribers(LOBBY_CHANNEL, { type: "LobbyTablesUpdated", tables: normalizedTables });
}

export async function attachLobbyHub(socket: WebSocket, connectionId: string) {
  await subscribeToChannel(connectionId, LOBBY_CHANNEL);

  // Send initial snapshot
  void grpc.game
    .ListTables({})
    .then((response) => {
      sendToLocal(connectionId, { type: "LobbyTablesUpdated", tables: (response.tables ?? []).map(toWireTableSummary) });
    })
    .catch(() => undefined);

  socket.on(
    "close",
    safeAsyncHandler(
      async () => {
        await unsubscribeFromChannel(connectionId, LOBBY_CHANNEL);
      },
      (err) => {
        logger.error({ err, connectionId }, "lobby.unsubscribe.failed");
      },
    ),
  );
}
