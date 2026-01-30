import { deliverToSubscribers } from '../ws/delivery';
import * as pubsub from '../ws/pubsub';
import logger from '../observability/logger';

export type BroadcastChannel =
  | { kind: 'table'; tableId: string }
  | { kind: 'chat'; tableId: string }
  | { kind: 'lobby' };

type ParseBroadcastChannelResult =
  | { ok: true; value: BroadcastChannel }
  | { ok: false; reason: 'invalid_format' | 'unknown_prefix' | 'missing_table_id' };

function parseBroadcastChannel(channel: string): ParseBroadcastChannelResult {
  if (channel === 'lobby') {
    return { ok: true, value: { kind: 'lobby' } };
  }

  const match = /^([^:]+):([^:]+)$/.exec(channel);
  if (!match) {
    return { ok: false, reason: 'invalid_format' };
  }

  const prefix = match[1];
  const tableId = match[2].trim();
  if (tableId.length === 0) {
    return { ok: false, reason: 'missing_table_id' };
  }

  if (prefix === 'table') {
    return { ok: true, value: { kind: 'table', tableId } };
  }
  if (prefix === 'chat') {
    return { ok: true, value: { kind: 'chat', tableId } };
  }

  return { ok: false, reason: 'unknown_prefix' };
}

type BroadcastPublisherMap = {
  readonly [K in BroadcastChannel['kind']]: (
    channel: Extract<BroadcastChannel, { kind: K }>,
    payload: Record<string, unknown>,
  ) => Promise<void>;
};

export type BroadcastPublisher = {
  publish(channel: BroadcastChannel, payload: Record<string, unknown>): Promise<void>;
};

type RedisBroadcastPublisherDeps = Pick<
  typeof pubsub,
  'publishTableEvent' | 'publishChatEvent' | 'publishLobbyEvent'
>;

export function createRedisBroadcastPublisher(deps: RedisBroadcastPublisherDeps): BroadcastPublisher {
  const publishToRedisByKind = {
    table: async (channel: Extract<BroadcastChannel, { kind: 'table' }>, payload) => {
      await deps.publishTableEvent(channel.tableId, payload);
    },
    chat: async (channel: Extract<BroadcastChannel, { kind: 'chat' }>, payload) => {
      await deps.publishChatEvent(channel.tableId, payload);
    },
    lobby: async (_channel: Extract<BroadcastChannel, { kind: 'lobby' }>, payload) => {
      const tables = payload.tables;
      if (Array.isArray(tables)) {
        await deps.publishLobbyEvent(tables);
      }
    },
  } satisfies BroadcastPublisherMap;

  async function publish(channel: BroadcastChannel, payload: Record<string, unknown>): Promise<void> {
    if (channel.kind === 'table') {
      await publishToRedisByKind.table(channel, payload);
      return;
    }

    if (channel.kind === 'chat') {
      await publishToRedisByKind.chat(channel, payload);
      return;
    }

    await publishToRedisByKind.lobby(channel, payload);
  }

  return { publish };
}

export type BroadcastService = {
  broadcastToChannel(channel: string, payload: Record<string, unknown>): Promise<void>;
  sendToUser(userId: string, payload: unknown): Promise<void>;
};

type BroadcastServiceDeps = {
  deliverToSubscribers: typeof deliverToSubscribers;
  publisher: BroadcastPublisher;
  logger: Pick<typeof logger, 'warn' | 'error'>;
};

export function createBroadcastService(
  overrides: Partial<BroadcastServiceDeps> = {},
): BroadcastService {
  const deps: BroadcastServiceDeps = {
    deliverToSubscribers: overrides.deliverToSubscribers ?? deliverToSubscribers,
    publisher: overrides.publisher ?? createRedisBroadcastPublisher(pubsub),
    logger: overrides.logger ?? logger,
  };

  async function broadcastToChannel(channel: string, payload: Record<string, unknown>) {
    try {
      // 1. Deliver to local subscribers (from Redis index).
      await deps.deliverToSubscribers(channel, payload);

      // 2. Publish to Redis for other instances
      // Note: The channel here might be "table:123" or "lobby" or "chat:123"
      // Our pubsub implementation currently uses specific methods.
      const parsedChannel = parseBroadcastChannel(channel);
      if (!parsedChannel.ok) {
        deps.logger.warn(
          { channel, reason: parsedChannel.reason },
          'Failed to publish to unknown channel',
        );
        return;
      }

      await deps.publisher.publish(parsedChannel.value, payload);
    } catch (err) {
      deps.logger.error({ err, channel }, 'Failed to broadcast to channel');
    }
  }

  async function sendToUser(_userId: string, _payload: unknown) {
    // This would require a way to find all connectionIds for a user
    // We have getConnectionsByUser in connectionStore
    // But we also need to know which instances they are on.
    // If we just want to send to local connections of that user:
    // (Implementation omitted for now as it's not strictly in the T-tasks yet but good to have)
  }

  return { broadcastToChannel, sendToUser };
}

const defaultBroadcastService = createBroadcastService();

export async function broadcastToChannel(channel: string, payload: Record<string, unknown>) {
  await defaultBroadcastService.broadcastToChannel(channel, payload);
}

export async function sendToUser(userId: string, payload: unknown) {
  await defaultBroadcastService.sendToUser(userId, payload);
}
