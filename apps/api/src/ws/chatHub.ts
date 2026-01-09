import { randomUUID } from "crypto";
import WebSocket from "ws";

import { getTableState } from "../services/tableState";
import { isUserMuted } from "../services/moderationService";

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

function broadcast(tableId: string, message: Record<string, unknown>) {
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

function isSeated(tableId: string, userId: string) {
  const state = getTableState(tableId);
  if (!state) {
    return false;
  }
  return state.seats.some((seat) => seat.userId === userId && seat.status !== "empty");
}

function handleSubscribe(client: ChatConnection, tableId: string) {
  if (!isSeated(tableId, client.userId)) {
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

function handleChatSend(client: ChatConnection, payload: { tableId: string; message?: string }) {
  const tableId = payload.tableId;
  const text = String(payload.message ?? "").trim();
  if (!text) {
    send(client.socket, { type: "ChatError", tableId, reason: "empty_message" });
    return;
  }

  if (!isSeated(tableId, client.userId)) {
    send(client.socket, { type: "ChatError", tableId, reason: "not_seated" });
    return;
  }

  if (isUserMuted(tableId, client.userId)) {
    send(client.socket, { type: "ChatError", tableId, reason: "muted" });
    return;
  }

  broadcast(tableId, {
    type: "ChatMessage",
    tableId,
    message: {
      id: randomUUID(),
      userId: client.userId,
      text,
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
      handleSubscribe(client, message.tableId as string);
      return;
    }
    if (type === "UnsubscribeChat") {
      handleUnsubscribe(client, message.tableId as string);
      return;
    }
    if (type === "ChatSend") {
      handleChatSend(client, {
        tableId: message.tableId as string,
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
