import { deliverToSubscribers } from '../ws/delivery';
import * as pubsub from '../ws/pubsub';
import logger from '../observability/logger';

type BroadcastChannel =
  | { kind: 'table'; tableId: string }
  | { kind: 'chat'; tableId: string }
  | { kind: 'lobby' };

function parseBroadcastChannel(channel: string): BroadcastChannel | null {
  if (channel === 'lobby') {
    return { kind: 'lobby' };
  }

  const [prefix, tableId] = channel.split(':');
  if (prefix === 'table' && tableId) {
    return { kind: 'table', tableId };
  }
  if (prefix === 'chat' && tableId) {
    return { kind: 'chat', tableId };
  }

  return null;
}

type BroadcastPublisherMap = {
  readonly [K in BroadcastChannel['kind']]: (
    channel: Extract<BroadcastChannel, { kind: K }>,
    payload: Record<string, unknown>,
  ) => Promise<void>;
};

const publishToRedisByKind = {
  table: async (channel: Extract<BroadcastChannel, { kind: 'table' }>, payload) => {
    await pubsub.publishTableEvent(channel.tableId, payload);
  },
  chat: async (channel: Extract<BroadcastChannel, { kind: 'chat' }>, payload) => {
    await pubsub.publishChatEvent(channel.tableId, payload);
  },
  lobby: async (_channel: Extract<BroadcastChannel, { kind: 'lobby' }>, payload) => {
    const tables = payload.tables;
    if (Array.isArray(tables)) {
      await pubsub.publishLobbyEvent(tables);
    }
  },
} satisfies BroadcastPublisherMap;

export async function broadcastToChannel(channel: string, payload: Record<string, unknown>) {
  try {
    // 1. Deliver to local subscribers (from Redis index).
    await deliverToSubscribers(channel, payload);

    // 2. Publish to Redis for other instances
    // Note: The channel here might be "table:123" or "lobby" or "chat:123"
    // Our pubsub implementation currently uses specific methods.
    const parsedChannel = parseBroadcastChannel(channel);
    if (!parsedChannel) {
      logger.warn({ channel }, 'Failed to publish to unknown channel');
      return;
    }

    await publishToRedisByKind[parsedChannel.kind](parsedChannel, payload);
  } catch (err) {
    logger.error({ err, channel }, 'Failed to broadcast to channel');
  }
}

export async function sendToUser(_userId: string, _payload: unknown) {
  // This would require a way to find all connectionIds for a user
  // We have getConnectionsByUser in connectionStore
  // But we also need to know which instances they are on.
  // If we just want to send to local connections of that user:
  // (Implementation omitted for now as it's not strictly in the T-tasks yet but good to have)
}
