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

type Logger = Pick<typeof logger, "info" | "warn" | "error">;

type WsPubSubHandlers = {
  onTableEvent: (message: WsPubSubMessage) => void;
  onChatEvent: (message: WsPubSubMessage) => void;
  onTimerEvent: (message: WsPubSubMessage) => void;
  onLobbyEvent: (message: WsPubSubMessage) => void;
};

export type WsPubSub = {
  getInstanceId(): string;
  init(handlers: WsPubSubHandlers): Promise<boolean>;
  close(): Promise<void>;
  publishTableEvent(tableId: string, payload: Record<string, unknown>): Promise<boolean>;
  publishChatEvent(tableId: string, payload: Record<string, unknown>): Promise<boolean>;
  publishTimerEvent(tableId: string, payload: Record<string, unknown>): Promise<boolean>;
  publishLobbyEvent(tables: unknown[]): Promise<boolean>;
};

type CreateWsPubSubOptions = {
  redisUrl: string;
  channel?: string;
  instanceId?: string;
  createClient?: typeof createClient;
  logger?: Logger;
};

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
  return getDefaultPubSub().getInstanceId();
}

export function createWsPubSub(options: CreateWsPubSubOptions): WsPubSub {
  const channel = options.channel ?? PUBSUB_CHANNEL;
  const instanceId = options.instanceId ?? randomUUID();
  const log = options.logger ?? logger;
  const createRedisClient = options.createClient ?? createClient;

  let pubClient: RedisClientType | null = null;
  let subClient: RedisClientType | null = null;
  let initialized = false;
  let initPromise: Promise<boolean> | null = null;
  let closePromise: Promise<void> | null = null;

  const init = async (handlers: WsPubSubHandlers): Promise<boolean> => {
    if (initialized) {
      return true;
    }
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      if (closePromise) {
        await closePromise;
      }

      pubClient = createRedisClient({ url: options.redisUrl });
      subClient = pubClient.duplicate();

      pubClient.on("error", (error) => {
        log.error({ err: error }, "Redis pubClient error");
      });
      subClient.on("error", (error) => {
        log.error({ err: error }, "Redis subClient error");
      });

      await pubClient.connect();
      await subClient.connect();

      const handlerByChannel: Record<WsChannel, (message: WsPubSubMessage) => void> = {
        table: handlers.onTableEvent,
        chat: handlers.onChatEvent,
        timer: handlers.onTimerEvent,
        lobby: handlers.onLobbyEvent,
      };

      await subClient.subscribe(channel, (message) => {
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
      log.info("WebSocket Pub/Sub initialized");
      return true;
    })().finally(() => {
      initPromise = null;
    });

    return initPromise;
  };

  const close = async (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }

    const closeClient = async (client: RedisClientType | null, label: string) => {
      if (!client?.isOpen) {
        return;
      }
      try {
        await client.quit();
      } catch (err: unknown) {
        log.warn({ err, label }, "Redis quit failed; forcing disconnect");
        client.disconnect();
      }
    };

    closePromise = Promise.all([closeClient(subClient, "subClient"), closeClient(pubClient, "pubClient")])
      .then(() => undefined)
      .finally(() => {
        pubClient = null;
        subClient = null;
        initialized = false;
        closePromise = null;
      });

    return closePromise;
  };

  const publish = async (message: Omit<WsPubSubMessage, "sourceId">): Promise<boolean> => {
    if (!pubClient) {
      return false;
    }
    const payload: WsPubSubMessage = { ...message, sourceId: instanceId };
    await pubClient.publish(channel, JSON.stringify(payload));
    return true;
  };

  return {
    getInstanceId: () => instanceId,
    init,
    close,
    publishTableEvent: (tableId, payload) => publish({ channel: "table", tableId, payload }),
    publishChatEvent: (tableId, payload) => publish({ channel: "chat", tableId, payload }),
    publishTimerEvent: (tableId, payload) => publish({ channel: "timer", tableId, payload }),
    publishLobbyEvent: (tables) => publish({ channel: "lobby", tableId: "lobby", payload: { tables } }),
  };
}

export async function closeWsPubSub(): Promise<void> {
  if (!defaultPubSub) {
    return;
  }

  const server = defaultPubSub;
  defaultPubSub = null;
  await server.close();
}

export async function publishTableEvent(tableId: string, payload: Record<string, unknown>) {
  return getDefaultPubSub().publishTableEvent(tableId, payload);
}

export async function publishChatEvent(tableId: string, payload: Record<string, unknown>) {
  return getDefaultPubSub().publishChatEvent(tableId, payload);
}

export async function publishTimerEvent(tableId: string, payload: Record<string, unknown>) {
  return getDefaultPubSub().publishTimerEvent(tableId, payload);
}

export async function publishLobbyEvent(tables: unknown[]) {
  return getDefaultPubSub().publishLobbyEvent(tables);
}

let defaultPubSub: WsPubSub | null = null;

function getDefaultPubSub(): WsPubSub {
  if (!defaultPubSub) {
    defaultPubSub = createWsPubSub({ redisUrl: getConfig().redisUrl, logger });
  }

  return defaultPubSub;
}

export async function initWsPubSub(handlers: WsPubSubHandlers): Promise<boolean> {
  return getDefaultPubSub().init(handlers);
}
