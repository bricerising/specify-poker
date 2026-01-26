import { randomUUID } from "crypto";
import { createClient, RedisClientType } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";
import { isRecord, safeJsonParseRecord } from "../utils/json";

type WsChannel = "table" | "chat" | "timer" | "lobby";

export type WsPubSubMessage = {
  channel: WsChannel;
  tableId: string;
  payload: Record<string, unknown>;
  sourceId: string;
};

const PUBSUB_CHANNEL = "gateway:ws:events";
const instanceId = randomUUID();
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let initialized = false;

function parseWsPubSubMessage(raw: string): WsPubSubMessage | null {
  const record = safeJsonParseRecord(raw);
  if (!record) {
    return null;
  }

  const channel = record.channel;
  if (channel !== "table" && channel !== "chat" && channel !== "timer" && channel !== "lobby") {
    return null;
  }

  const tableId = typeof record.tableId === "string" ? record.tableId : "";
  const sourceId = typeof record.sourceId === "string" ? record.sourceId : "";
  const payload = record.payload;
  if (!tableId || !sourceId || !isRecord(payload)) {
    return null;
  }

  return { channel, tableId, payload, sourceId };
}

export function getWsInstanceId() {
  return instanceId;
}

export async function initWsPubSub(handlers: {
  onTableEvent: (message: WsPubSubMessage) => void;
  onChatEvent: (message: WsPubSubMessage) => void;
  onTimerEvent: (message: WsPubSubMessage) => void;
  onLobbyEvent: (message: WsPubSubMessage) => void;
}) {
  const config = getConfig();
  const url = config.redisUrl;

  if (initialized) {
    return true;
  }

  pubClient = createClient({ url });
  subClient = pubClient.duplicate();

  pubClient.on("error", (error) => {
    logger.error({ err: error }, "Redis pubClient error");
  });
  subClient.on("error", (error) => {
    logger.error({ err: error }, "Redis subClient error");
  });

  await pubClient.connect();
  await subClient.connect();

  const handlerByChannel: Record<WsChannel, (message: WsPubSubMessage) => void> = {
    table: handlers.onTableEvent,
    chat: handlers.onChatEvent,
    timer: handlers.onTimerEvent,
    lobby: handlers.onLobbyEvent,
  };

  await subClient.subscribe(PUBSUB_CHANNEL, (message) => {
    const parsed = parseWsPubSubMessage(message);
    if (!parsed) {
      return;
    }
    if (parsed.sourceId === instanceId) {
      return;
    }

    handlerByChannel[parsed.channel](parsed);
  });

  initialized = true;
  logger.info("WebSocket Pub/Sub initialized");
  return true;
}

async function publish(message: Omit<WsPubSubMessage, "sourceId">) {
  if (!pubClient) {
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
