import { getSubscribers } from "../ws/subscriptions";
import { sendToLocal } from "../ws/localRegistry";
import * as pubsub from "../ws/pubsub";
import logger from "../observability/logger";

export async function broadcastToChannel(channel: string, payload: any) {
  try {
    // 1. Get all subscribers for this channel (from Redis)
    const connectionIds = await getSubscribers(channel);
    
    // 2. Deliver to local connections
    let localCount = 0;
    for (const connId of connectionIds) {
      if (sendToLocal(connId, payload)) {
        localCount++;
      }
    }

    // 3. Publish to Redis for other instances
    // Note: The channel here might be "table:123" or "lobby" or "chat:123"
    // Our pubsub implementation currently uses specific methods.
    if (channel.startsWith("table:")) {
      const tableId = channel.split(":")[1];
      await pubsub.publishTableEvent(tableId, payload);
    } else if (channel.startsWith("chat:")) {
      const tableId = channel.split(":")[1];
      await pubsub.publishChatEvent(tableId, payload);
    } else if (channel === "lobby") {
      // Lobby event in pubsub expects an array of tables... 
      // maybe we should generalize pubsub a bit more.
      // For now, let's just handle it.
      if (payload.tables) {
          await pubsub.publishLobbyEvent(payload.tables);
      }
    }
  } catch (err) {
    logger.error({ err, channel }, "Failed to broadcast to channel");
  }
}

export async function sendToUser(userId: string, payload: any) {
    // This would require a way to find all connectionIds for a user
    // We have getConnectionsByUser in connectionStore
    // But we also need to know which instances they are on.
    // If we just want to send to local connections of that user:
    // (Implementation omitted for now as it's not strictly in the T-tasks yet but good to have)
}
