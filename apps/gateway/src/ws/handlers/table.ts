import type WebSocket from 'ws';

import { fireAndForget } from '@specify-poker/shared';
import { grpcResult } from '../../grpc/unaryClients';
import type { WsPubSubMessage } from '../pubsub';
import {
  checkWsRateLimit,
  parseActionType,
  parseFiniteNumber,
  parseSeatId,
  parseTableId,
} from '../validators';
import { subscribeToChannel, unsubscribeFromChannel, unsubscribeAll } from '../subscriptions';
import { sendToLocal, getLocalConnectionMeta } from '../localRegistry';
import { deliverToSubscribers } from '../delivery';
import logger from '../../observability/logger';
import { parseWsClientMessage, type WsClientMessage } from '../clientMessage';
import { attachWsRouter, type WsHub } from '../router';
import { toWireTableStateView } from '../transforms/gameWire';

export async function handleTablePubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== 'table' && message.channel !== 'timer') {
    return;
  }

  await deliverToSubscribers(`table:${message.tableId}`, message.payload);
}

async function handleSubscribe(connectionId: string, userId: string, tableId: string) {
  const channel = `table:${tableId}`;
  await subscribeToChannel(connectionId, channel);

  fireAndForget(
    () => grpcResult.game.JoinSpectator({ table_id: tableId, user_id: userId }),
    (error: unknown) => {
      logger.warn({ err: error, tableId, userId }, 'spectator.join.failed');
    },
  );

  const [tableResult, stateResult] = await Promise.all([
    grpcResult.game.GetTable({ table_id: tableId }),
    grpcResult.game.GetTableState({ table_id: tableId, user_id: userId }),
  ]);

  if (!stateResult.ok) {
    logger.error({ err: stateResult.error, tableId }, 'Failed to get table state from game service');
    return;
  }

  const table = tableResult.ok ? tableResult.value : null;
  const tableStateWire = toWireTableStateView(table, stateResult.value.state);
  sendToLocal(connectionId, { type: 'TableSnapshot', tableState: tableStateWire });

  const holeCards = stateResult.value.hole_cards;
  if (Array.isArray(holeCards) && holeCards.length > 0) {
    sendToLocal(connectionId, {
      type: 'HoleCards',
      tableId,
      handId: tableStateWire.hand?.handId,
      cards: holeCards,
    });
  }
}

async function handleUnsubscribe(connectionId: string, tableId: string) {
  const channel = `table:${tableId}`;
  await unsubscribeFromChannel(connectionId, channel);
}

async function handleAction(
  connectionId: string,
  userId: string,
  payload: { tableId: string; actionType: string; amount?: number },
) {
  const meta = getLocalConnectionMeta(connectionId);
  const ip = meta?.ip ?? 'unknown';
  if (!(await checkWsRateLimit(userId, ip, 'action')).ok) {
    sendToLocal(connectionId, {
      type: 'ActionResult',
      tableId: payload.tableId,
      accepted: false,
      reason: 'rate_limited',
    });
    return;
  }

  const request: { table_id: string; user_id: string; action_type: string; amount?: number } = {
    table_id: payload.tableId,
    user_id: userId,
    action_type: payload.actionType,
  };
  if (payload.amount !== undefined) {
    request.amount = payload.amount;
  }

  const result = await grpcResult.game.SubmitAction(request);
  if (!result.ok) {
    sendToLocal(connectionId, {
      type: 'ActionResult',
      tableId: payload.tableId,
      accepted: false,
      reason: 'internal_error',
    });
    return;
  }

  const response = result.value;
  sendToLocal(connectionId, {
    type: 'ActionResult',
    tableId: payload.tableId,
    accepted: response.ok,
    reason: response.error,
  });
}

async function handleJoinSeat(
  connectionId: string,
  userId: string,
  payload: { tableId: string; seatId: number; buyInAmount?: number },
) {
  const buyInAmount = payload.buyInAmount && payload.buyInAmount > 0 ? payload.buyInAmount : 200;
  const result = await grpcResult.game.JoinSeat({
    table_id: payload.tableId,
    user_id: userId,
    seat_id: payload.seatId,
    buy_in_amount: buyInAmount,
  });

  if (!result.ok) {
    sendToLocal(connectionId, { type: 'Error', message: 'Internal error' });
    return;
  }

  if (!result.value.ok) {
    sendToLocal(connectionId, {
      type: 'Error',
      message: result.value.error ?? 'Failed to join seat',
    });
  }
}

async function handleLeaveTable(userId: string, tableId: string) {
  await grpcResult.game.LeaveSeat({
    table_id: tableId,
    user_id: userId,
  });
}

export function createTableHub(params: {
  connectionId: string;
  userId: string;
}): WsHub<WsClientMessage> {
  const { connectionId, userId } = params;

  return {
    hubName: 'table',
    getAttributes: (message): Record<string, string> => {
      if ('tableId' in message && typeof message.tableId === 'string') {
        return { 'poker.table_id': message.tableId };
      }
      return {};
    },
    handlers: {
      SubscribeTable: async (message) => {
        await handleSubscribe(connectionId, userId, message.tableId);
      },
      UnsubscribeTable: async (message) => {
        fireAndForget(
          () => grpcResult.game.LeaveSpectator({ table_id: message.tableId, user_id: userId }),
          (error: unknown) => {
            logger.warn(
              { err: error, tableId: message.tableId, userId },
              'spectator.leave.failed',
            );
          },
        );
        await handleUnsubscribe(connectionId, message.tableId);
      },
      JoinSeat: async (message) => {
        const seatId = parseSeatId(message.seatId);
        if (seatId === null) {
          return;
        }
        const buyInAmount = parseFiniteNumber(message.buyInAmount) ?? undefined;
        await handleJoinSeat(connectionId, userId, {
          tableId: message.tableId,
          seatId,
          buyInAmount,
        });
      },
      LeaveTable: async (message) => {
        await handleLeaveTable(userId, message.tableId);
      },
      Action: async (message) => {
        const tableId = parseTableId(message.tableId);
        if (!tableId) {
          return;
        }
        const actionType = parseActionType(message.action);
        if (!actionType) {
          sendToLocal(connectionId, {
            type: 'ActionResult',
            tableId,
            accepted: false,
            reason: 'invalid_action',
          });
          return;
        }

        const requiresAmount = actionType === 'BET' || actionType === 'RAISE';
        const amount = parseFiniteNumber(message.amount);
        if (requiresAmount && amount === null) {
          sendToLocal(connectionId, {
            type: 'ActionResult',
            tableId,
            accepted: false,
            reason: 'missing_amount',
          });
          return;
        }

        await handleAction(connectionId, userId, {
          tableId,
          actionType,
          ...(amount !== null ? { amount } : {}),
        });
      },
      ResyncTable: async (message) => {
        await handleSubscribe(connectionId, userId, message.tableId);
      },
    },
  };
}

export function attachTableHub(socket: WebSocket, userId: string, connectionId: string) {
  attachWsRouter(socket, {
    ...createTableHub({ connectionId, userId }),
    parseMessage: parseWsClientMessage,
    onClose: async () => {
      await unsubscribeAll(connectionId);
    },
  });
}
