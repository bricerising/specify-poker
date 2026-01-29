import { randomUUID } from 'crypto';
import type WebSocket from 'ws';
import type { z } from 'zod';
import { wsClientMessageSchema } from '@specify-poker/shared';

import { grpcResult } from '../../grpc/unaryClients';
import type { WsPubSubMessage } from '../pubsub';
import { checkWsRateLimit, parseChatMessage, parseTableId } from '../validators';
import { subscribeToChannel, unsubscribeFromChannel, unsubscribeAll } from '../subscriptions';
import { getLocalConnectionMeta, sendToLocal } from '../localRegistry';
import { deliverToSubscribers } from '../delivery';
import { broadcastToChannel } from '../../services/broadcastService';
import { saveChatMessage, getChatHistory } from '../../storage/chatStore';
import { parseJsonWithSchema } from '../messageParsing';
import { attachWsRouter } from '../router';

type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

function parseClientMessage(data: WebSocket.RawData): WsClientMessage | null {
  return parseJsonWithSchema(data, wsClientMessageSchema);
}

export async function handleChatPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== 'chat') {
    return;
  }
  await deliverToSubscribers(`chat:${message.tableId}`, message.payload);
}

async function getMembership(
  tableId: string,
  userId: string,
): Promise<{ seated: boolean; spectator: boolean }> {
  const result = await grpcResult.game.GetTableState({
    table_id: tableId,
    user_id: userId,
  });
  if (!result.ok) {
    return { seated: false, spectator: false };
  }

  const response = result.value;
  const seated =
    response.state?.seats?.some((seat) => seat.user_id === userId && seat.status !== 'empty') ??
    false;
  const spectator =
    response.state?.spectators?.some((spectator) => spectator.user_id === userId) ?? false;
  return { seated, spectator };
}

async function isMuted(tableId: string, userId: string): Promise<boolean> {
  const result = await grpcResult.game.IsMuted({
    table_id: tableId,
    user_id: userId,
  });
  if (!result.ok) {
    return false;
  }

  return result.value.is_muted;
}

async function getUsername(userId: string): Promise<string> {
  const result = await grpcResult.player.GetProfile({ user_id: userId });
  if (!result.ok) {
    return 'Unknown';
  }

  const username = (result.value.profile as { username?: unknown } | undefined)?.username;
  if (typeof username === 'string' && username.trim().length > 0) {
    return username;
  }
  return 'Unknown';
}

async function handleSubscribe(connectionId: string, tableId: string) {
  const channel = `chat:${tableId}`;
  await subscribeToChannel(connectionId, channel);

  const history = await getChatHistory(tableId);
  sendToLocal(connectionId, { type: 'ChatSubscribed', tableId, history });
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
    sendToLocal(connectionId, { type: 'ChatError', tableId, reason: parsed.reason });
    return;
  }

  const meta = getLocalConnectionMeta(connectionId);
  const ip = meta?.ip ?? 'unknown';
  if (!(await checkWsRateLimit(userId, ip, 'chat')).ok) {
    sendToLocal(connectionId, { type: 'ChatError', tableId, reason: 'rate_limited' });
    return;
  }

  const { seated, spectator } = await getMembership(tableId, userId);
  if (!seated && !spectator) {
    sendToLocal(connectionId, { type: 'ChatError', tableId, reason: 'not_seated' });
    return;
  }

  if (await isMuted(tableId, userId)) {
    sendToLocal(connectionId, { type: 'ChatError', tableId, reason: 'muted' });
    return;
  }

  const username = await getUsername(userId);
  const chatMessage = {
    id: randomUUID(),
    userId: userId,
    username,
    text: parsed.text,
    ts: new Date().toISOString(),
  };

  await saveChatMessage(tableId, chatMessage);
  await broadcastToChannel(`chat:${tableId}`, {
    type: 'ChatMessage',
    tableId,
    message: chatMessage,
  });
}

export function attachChatHub(socket: WebSocket, userId: string, connectionId: string) {
  attachWsRouter(socket, {
    hubName: 'chat',
    parseMessage: parseClientMessage,
    getAttributes: (message): Record<string, string> => {
      if ('tableId' in message && typeof message.tableId === 'string') {
        return { 'poker.table_id': message.tableId };
      }
      return {};
    },
    handlers: {
      SubscribeChat: async (message) => {
        const tableId = parseTableId(message.tableId);
        if (!tableId) {
          return;
        }
        await handleSubscribe(connectionId, tableId);
      },
      UnsubscribeChat: async (message) => {
        const tableId = parseTableId(message.tableId);
        if (!tableId) {
          return;
        }
        await handleUnsubscribe(connectionId, tableId);
      },
      ChatSend: async (message) => {
        const tableId = parseTableId(message.tableId);
        if (!tableId) {
          return;
        }
        await handleChatSend(connectionId, userId, { tableId, message: message.message });
      },
    },
    onClose: async () => {
      await unsubscribeAll(connectionId);
    },
  });
}
