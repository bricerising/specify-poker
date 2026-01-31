import { randomUUID } from 'crypto';
import { createAsyncLifecycle, createLazyValue } from '@specify-poker/shared';
import { createRedisClientManager, type RedisClientLogger } from '@specify-poker/shared/redis';
import { getConfig } from '../config';
import logger from '../observability/logger';
import { isRecord, safeJsonParseRecord } from '../utils/json';

type WsChannel = 'table' | 'chat' | 'timer' | 'lobby';

const HANDLER_BY_CHANNEL: Record<WsChannel, keyof WsPubSubHandlers> = {
  table: 'onTableEvent',
  chat: 'onChatEvent',
  timer: 'onTimerEvent',
  lobby: 'onLobbyEvent',
};

export type WsPubSubMessage = {
  channel: WsChannel;
  tableId: string;
  payload: Record<string, unknown>;
  sourceId: string;
};

const PUBSUB_CHANNEL = 'gateway:ws:events';

type Logger = Pick<typeof logger, 'info' | 'warn' | 'error'>;

type CreateRedisClient = Parameters<typeof createRedisClientManager>[0]['createClient'];

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
  createClient?: CreateRedisClient;
  logger?: Logger;
};

function parseWsPubSubMessage(raw: string): WsPubSubMessage | null {
  const record = safeJsonParseRecord(raw);
  if (!record) {
    return null;
  }

  const channel = record.channel;
  if (channel !== 'table' && channel !== 'chat' && channel !== 'timer' && channel !== 'lobby') {
    return null;
  }

  const tableId = typeof record.tableId === 'string' ? record.tableId : '';
  const sourceId = typeof record.sourceId === 'string' ? record.sourceId : '';
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

  const redisLogger: RedisClientLogger = {};
  if (typeof log.info === 'function') {
    redisLogger.info = (obj, msg) => log.info(obj, msg);
  }
  if (typeof log.warn === 'function') {
    redisLogger.warn = (obj, msg) => log.warn(obj, msg);
  }
  if (typeof log.error === 'function') {
    redisLogger.error = (obj, msg) => log.error(obj, msg);
  }

  const redis = createRedisClientManager({
    url: options.redisUrl,
    createClient: options.createClient,
    log: redisLogger,
    name: 'gateway-ws-pubsub',
  });

  let activeHandlers: WsPubSubHandlers | null = null;

  const lifecycle = createAsyncLifecycle({
    start: async () => {
      if (!activeHandlers) {
        throw new Error('ws.pubsub.handlers_missing');
      }

      await redis.getClient(); // Ensure pub client is connected before returning.
      const subClient = await redis.getBlockingClient();

      await subClient.subscribe(channel, (message) => {
        const parsed = parseWsPubSubMessage(message);
        if (!parsed) {
          return;
        }
        if (parsed.sourceId === instanceId) {
          return;
        }

        const handlers = activeHandlers;
        if (!handlers) {
          return;
        }

        handlers[HANDLER_BY_CHANNEL[parsed.channel]](parsed);
      });

      log.info('WebSocket Pub/Sub initialized');
    },
    stop: async () => {
      activeHandlers = null;
      await redis.close();
    },
  });

  const init = async (handlers: WsPubSubHandlers): Promise<boolean> => {
    activeHandlers = handlers;
    await lifecycle.start();
    return true;
  };

  const close = async (): Promise<void> => {
    await lifecycle.stop();
  };

  const publish = async (message: Omit<WsPubSubMessage, 'sourceId'>): Promise<boolean> => {
    if (!lifecycle.isRunning()) {
      return false;
    }

    const pubClient = await redis.getClient();
    const payload: WsPubSubMessage = { ...message, sourceId: instanceId };
    await pubClient.publish(channel, JSON.stringify(payload));
    return true;
  };

  return {
    getInstanceId: () => instanceId,
    init,
    close,
    publishTableEvent: (tableId, payload) => publish({ channel: 'table', tableId, payload }),
    publishChatEvent: (tableId, payload) => publish({ channel: 'chat', tableId, payload }),
    publishTimerEvent: (tableId, payload) => publish({ channel: 'timer', tableId, payload }),
    publishLobbyEvent: (tables) =>
      publish({ channel: 'lobby', tableId: 'lobby', payload: { tables } }),
  };
}

export async function closeWsPubSub(): Promise<void> {
  const server = defaultPubSub.peek();
  if (!server) {
    return;
  }

  try {
    await server.close();
  } finally {
    defaultPubSub.reset();
  }
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

const defaultPubSub = createLazyValue<WsPubSub>(() =>
  createWsPubSub({ redisUrl: getConfig().redisUrl, logger }),
);

function getDefaultPubSub(): WsPubSub {
  return defaultPubSub.get();
}

export async function initWsPubSub(handlers: WsPubSubHandlers): Promise<boolean> {
  return getDefaultPubSub().init(handlers);
}
