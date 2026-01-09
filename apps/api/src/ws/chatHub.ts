import { randomUUID } from "crypto";
import WebSocket from "ws";

import { getTableState } from "../services/tableState";
import { isUserMuted } from "../services/moderationService";
import { getProfile } from "../services/profileService";
import { WsPubSubMessage, publishChatEvent } from "./pubsub";
import { checkWsRateLimit, parseChatMessage, parseTableId } from "./validators";

interface ChatConnection {
  socket: WebSocket;
  userId: string;
  connectionId: string;
  subscriptions: Set<string>;
}

const clients = new Map<string, ChatConnection>();
const chatSubscriptions = new Map<string, Set<string>>();

function send(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastLocal(tableId: string, message: Record<string, unknown>) {
  const subscribers = chatSubscriptions.get(tableId);
  if (!subscribers) {
    return;
  }
  for (const connectionId of subscribers) {
    const client = clients.get(connectionId);
    if (client) {
      send(client.socket, message);
    }
  }
}

export function handleChatPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "chat") {
    return;
  }
  broadcastLocal(message.tableId, message.payload);
}

async function broadcast(tableId: string, message: Record<string, unknown>) {
  broadcastLocal(tableId, message);
  await publishChatEvent(tableId, message);
}

async function isSeated(tableId: string, userId: string) {
  const state = await getTableState(tableId);
  if (!state) {
    return false;
  }
  return state.seats.some((seat) => seat.userId === userId && seat.status !== "empty");
}

async function handleSubscribe(client: ChatConnection, tableId: string) {
  if (!(await isSeated(tableId, client.userId))) {
    send(client.socket, {
      type: "ChatError",
      tableId,
      reason: "not_seated",
    });
    return;
  }

  client.subscriptions.add(tableId);
  const subscribers = chatSubscriptions.get(tableId) ?? new Set<string>();
  subscribers.add(client.connectionId);
  chatSubscriptions.set(tableId, subscribers);
  send(client.socket, {
    type: "ChatSubscribed",
    tableId,
  });
}

function handleUnsubscribe(client: ChatConnection, tableId: string) {
  client.subscriptions.delete(tableId);
  const subscribers = chatSubscriptions.get(tableId);
  if (!subscribers) {
    return;
  }
  subscribers.delete(client.connectionId);
  if (subscribers.size === 0) {
    chatSubscriptions.delete(tableId);
  }
}

async function handleChatSend(client: ChatConnection, payload: { tableId: string; message?: string }) {
  const tableId = payload.tableId;
  const parsed = parseChatMessage(payload.message);
  if (!parsed.ok) {
    send(client.socket, { type: "ChatError", tableId, reason: parsed.reason });
    return;
  }
  const rate = checkWsRateLimit(client.connectionId, "chat");
  if (!rate.ok) {
    send(client.socket, { type: "ChatError", tableId, reason: "rate_limited" });
    return;
  }

  if (!(await isSeated(tableId, client.userId))) {
    send(client.socket, { type: "ChatError", tableId, reason: "not_seated" });
    return;
  }

  if (await isUserMuted(tableId, client.userId)) {
    send(client.socket, { type: "ChatError", tableId, reason: "muted" });
    return;
  }

  const profile = await getProfile(client.userId);

  await broadcast(tableId, {
    type: "ChatMessage",
    tableId,
    message: {
      id: randomUUID(),
      userId: client.userId,
      nickname: profile.nickname,
      text: parsed.text,
      ts: new Date().toISOString(),
    },
  });
}

export function attachChatHub(socket: WebSocket, userId: string, connectionId: string) {
  const client: ChatConnection = {
    socket,
    userId,
    connectionId,
    subscriptions: new Set(),
  };
  clients.set(connectionId, client);

  socket.on("message", (data) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    const type = message.type;
    if (type === "SubscribeChat") {
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        send(client.socket, { type: "ChatError", tableId: null, reason: "invalid_table" });
        return;
      }
      void handleSubscribe(client, tableId);
      return;
    }
    if (type === "UnsubscribeChat") {
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        return;
      }
      handleUnsubscribe(client, tableId);
      return;
    }
    if (type === "ChatSend") {
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        send(client.socket, { type: "ChatError", tableId: null, reason: "invalid_table" });
        return;
      }
      void handleChatSend(client, {
        tableId,
        message: message.message as string | undefined,
      });
    }
  });

  socket.on("close", () => {
    for (const tableId of client.subscriptions) {
      handleUnsubscribe(client, tableId);
    }
    clients.delete(connectionId);
  });
}
