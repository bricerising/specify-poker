import { randomUUID } from "crypto";
import { createClient, RedisClientType } from "redis";

import { getRedisUrl } from "../services/redisClient";

type WsChannel = "table" | "chat" | "timer" | "lobby";

export type WsPubSubMessage = {
  channel: WsChannel;
  tableId: string;
  payload: Record<string, unknown>;
  sourceId: string;
};

const PUBSUB_CHANNEL = "poker:ws:events";
const instanceId = randomUUID();
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let initialized = false;

export function getWsInstanceId() {
  return instanceId;
}

export async function initWsPubSub(handlers: {
  onTableEvent: (message: WsPubSubMessage) => void;
  onChatEvent: (message: WsPubSubMessage) => void;
  onTimerEvent: (message: WsPubSubMessage) => void;
  onLobbyEvent: (message: WsPubSubMessage) => void;
}) {
  const url = getRedisUrl();
  if (!url) {
    return false;
  }
  if (initialized) {
    return true;
  }

  pubClient = createClient({ url });
  subClient = pubClient.duplicate();

  pubClient.on("error", (error) => {
    console.warn("redis.pubsub.error", { message: error.message });
  });
  subClient.on("error", (error) => {
    console.warn("redis.pubsub.error", { message: error.message });
  });

  await pubClient.connect();
  await subClient.connect();

  await subClient.subscribe(PUBSUB_CHANNEL, (message) => {
    let parsed: WsPubSubMessage;
    try {
      parsed = JSON.parse(message) as WsPubSubMessage;
    } catch {
      return;
    }
    if (parsed.sourceId === instanceId) {
      return;
    }
    if (parsed.channel === "table") {
      handlers.onTableEvent(parsed);
      return;
    }
    if (parsed.channel === "chat") {
      handlers.onChatEvent(parsed);
      return;
    }
    if (parsed.channel === "timer") {
      handlers.onTimerEvent(parsed);
      return;
    }
    if (parsed.channel === "lobby") {
      handlers.onLobbyEvent(parsed);
    }
  });

  initialized = true;
  return true;
}

async function publish(message: Omit<WsPubSubMessage, "sourceId">) {
  const url = getRedisUrl();
  if (!url || !pubClient) {
    return false;
  }
  const payload: WsPubSubMessage = { ...message, sourceId: instanceId };
  await pubClient.publish(PUBSUB_CHANNEL, JSON.stringify(payload));
  return true;
}

export async function publishTableEvent(tableId: string, payload: Record<string, unknown>) {
  return publish({ channel: "table", tableId, payload });
}

export async function publishChatEvent(tableId: string, payload: Record<string, unknown>) {
  return publish({ channel: "chat", tableId, payload });
}

export async function publishTimerEvent(tableId: string, payload: Record<string, unknown>) {
  return publish({ channel: "timer", tableId, payload });
}

export async function publishLobbyEvent(tables: unknown[]) {
  return publish({ channel: "lobby", tableId: "lobby", payload: { tables } });
}
