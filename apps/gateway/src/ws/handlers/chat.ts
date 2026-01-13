import { randomUUID } from "crypto";
import WebSocket from "ws";
import { gameClient, playerClient } from "../../grpc/clients";
import { WsPubSubMessage } from "../pubsub";
import { checkWsRateLimit, parseChatMessage, parseTableId } from "../validators";
import { subscribeToChannel, unsubscribeFromChannel, unsubscribeAll, getSubscribers } from "../subscriptions";
import { getLocalConnectionMeta, sendToLocal } from "../localRegistry";
import { broadcastToChannel } from "../../services/broadcastService";
import { saveChatMessage, getChatHistory } from "../../storage/chatStore";

function rawDataToString(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}

function parseJsonObject(data: WebSocket.RawData): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawDataToString(data));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function handleChatPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "chat") {
    return;
  }
  const channel = `chat:${message.tableId}`;
  const subscribers = await getSubscribers(channel);
  for (const connId of subscribers) {
    sendToLocal(connId, message.payload);
  }
}

async function isSeated(tableId: string, userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    gameClient.GetTableState({ table_id: tableId, user_id: userId }, (err, response) => {
      if (err || !response?.state) {
        resolve(false);
        return;
      }
      const isSeated = response.state?.seats?.some((s) => s.user_id === userId && s.status !== "empty") || false;
      resolve(isSeated);
    });
  });
}

async function isSpectator(tableId: string, userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    gameClient.GetTableState({ table_id: tableId, user_id: userId }, (err, response) => {
      if (err || !response?.state) {
        resolve(false);
        return;
      }
      const found = response.state?.spectators?.some((s) => s.user_id === userId) || false;
      resolve(found);
    });
  });
}

async function isMuted(tableId: string, userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    gameClient.IsMuted({ table_id: tableId, user_id: userId }, (err, response) => {
      if (err || !response) {
        resolve(false);
        return;
      }
      resolve(response.is_muted);
    });
  });
}

async function getNickname(userId: string): Promise<string> {
  return new Promise((resolve) => {
    playerClient.GetProfile({ user_id: userId }, (err, response) => {
      const nickname = response?.profile?.nickname;
      if (err || typeof nickname !== "string" || nickname.trim().length === 0) {
        resolve("Unknown");
        return;
      }
      resolve(nickname);
    });
  });
}

async function handleSubscribe(connectionId: string, tableId: string) {
  const channel = `chat:${tableId}`;
  await subscribeToChannel(connectionId, channel);

  const history = await getChatHistory(tableId);
  sendToLocal(connectionId, { type: "ChatSubscribed", tableId, history });
}

async function handleUnsubscribe(connectionId: string, tableId: string) {
  const channel = `chat:${tableId}`;
  await unsubscribeFromChannel(connectionId, channel);
}

async function handleChatSend(
  connectionId: string,
  userId: string,
  payload: { tableId: string; message: unknown },
) {
  const tableId = payload.tableId;
  const parsed = parseChatMessage(payload.message);
  if (!parsed.ok) {
    sendToLocal(connectionId, { type: "ChatError", tableId, reason: parsed.reason });
    return;
  }

  const meta = getLocalConnectionMeta(connectionId);
  const ip = meta?.ip ?? "unknown";
  if (!(await checkWsRateLimit(userId, ip, "chat")).ok) {
    sendToLocal(connectionId, { type: "ChatError", tableId, reason: "rate_limited" });
    return;
  }

  const seated = await isSeated(tableId, userId);
  const spectator = seated ? false : await isSpectator(tableId, userId);
  if (!seated && !spectator) {
    sendToLocal(connectionId, { type: "ChatError", tableId, reason: "not_seated" });
    return;
  }

  if (await isMuted(tableId, userId)) {
    sendToLocal(connectionId, { type: "ChatError", tableId, reason: "muted" });
    return;
  }

  const nickname = await getNickname(userId);
  const chatMessage = {
    id: randomUUID(),
    userId: userId,
    nickname,
    text: parsed.text,
    ts: new Date().toISOString(),
  };

  await saveChatMessage(tableId, chatMessage);
  await broadcastToChannel(`chat:${tableId}`, {
    type: "ChatMessage",
    tableId,
    message: chatMessage,
  });
}

export function attachChatHub(socket: WebSocket, userId: string, connectionId: string) {
  socket.on("message", async (data) => {
    const message = parseJsonObject(data);
    if (!message) {
      return;
    }

    const type = typeof message.type === "string" ? message.type : null;
    const tableId = parseTableId(message.tableId);

    switch (type) {
      case "SubscribeChat": {
        if (!tableId) return;
        await handleSubscribe(connectionId, tableId);
        return;
      }
      case "UnsubscribeChat": {
        if (!tableId) return;
        await handleUnsubscribe(connectionId, tableId);
        return;
      }
      case "ChatSend": {
        if (!tableId) return;
        await handleChatSend(connectionId, userId, { tableId, message: message.message });
        return;
      }
      default:
        return;
    }
  });

  socket.on("close", async () => {
    await unsubscribeAll(connectionId);
  });
}
