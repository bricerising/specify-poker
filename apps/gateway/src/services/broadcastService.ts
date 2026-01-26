import { deliverToSubscribers } from "../ws/delivery";
import * as pubsub from "../ws/pubsub";
import logger from "../observability/logger";

type BroadcastChannel =
  | { kind: "table"; tableId: string }
  | { kind: "chat"; tableId: string }
  | { kind: "lobby" };

function parseBroadcastChannel(channel: string): BroadcastChannel | null {
  if (channel === "lobby") {
    return { kind: "lobby" };
  }

  const [prefix, tableId] = channel.split(":");
  if (prefix === "table" && tableId) {
    return { kind: "table", tableId };
  }
  if (prefix === "chat" && tableId) {
    return { kind: "chat", tableId };
  }

  return null;
}

export async function broadcastToChannel(channel: string, payload: Record<string, unknown>) {
  try {
    // 1. Deliver to local subscribers (from Redis index).
    await deliverToSubscribers(channel, payload);

    // 3. Publish to Redis for other instances
    // Note: The channel here might be "table:123" or "lobby" or "chat:123"
    // Our pubsub implementation currently uses specific methods.
    const parsedChannel = parseBroadcastChannel(channel);
    if (!parsedChannel) {
      logger.warn({ channel }, "Failed to publish to unknown channel");
      return;
    }

    switch (parsedChannel.kind) {
      case "table":
        await pubsub.publishTableEvent(parsedChannel.tableId, payload);
        break;
      case "chat":
        await pubsub.publishChatEvent(parsedChannel.tableId, payload);
        break;
      case "lobby": {
        const tables = payload.tables;
        if (Array.isArray(tables)) {
          await pubsub.publishLobbyEvent(tables);
        }
        break;
      }
    }
  } catch (err) {
    logger.error({ err, channel }, "Failed to broadcast to channel");
  }
}

export async function sendToUser(_userId: string, _payload: unknown) {
  // This would require a way to find all connectionIds for a user
  // We have getConnectionsByUser in connectionStore
  // But we also need to know which instances they are on.
  // If we just want to send to local connections of that user:
  // (Implementation omitted for now as it's not strictly in the T-tasks yet but good to have)
}
