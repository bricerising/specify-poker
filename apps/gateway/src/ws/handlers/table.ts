import WebSocket from "ws";
import type { z } from "zod";
import { wsClientMessageSchema } from "@specify-poker/shared";

import { gameClient } from "../../grpc/clients";
import { WsPubSubMessage } from "../pubsub";
import { parseActionType, parseSeatId, parseTableId, checkWsRateLimit } from "../validators";
import { subscribeToChannel, unsubscribeFromChannel, unsubscribeAll, getSubscribers } from "../subscriptions";
import { sendToLocal, getLocalConnectionMeta } from "../localRegistry";
import logger from "../../observability/logger";
import { parseJsonObject } from "../messageParsing";
import { attachWsRouter } from "../router";
import { toWireTableStateView } from "../transforms/gameWire";

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

function parseClientMessage(data: WebSocket.RawData): WsClientMessage | null {
  const obj = parseJsonObject(data);
  if (!obj) {
    return null;
  }
  const parsed = wsClientMessageSchema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

function grpcCall<TRequest, TResponse>(
  method: (request: TRequest, callback: (err: Error | null, response: TResponse) => void) => void,
  request: TRequest,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method(request, (err: Error | null, response: TResponse) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(response);
    });
  });
}

export async function handleTablePubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "table" && message.channel !== "timer") {
    return;
  }

  const channel = `table:${message.tableId}`;
  const subscribers = await getSubscribers(channel);
  for (const connId of subscribers) {
    sendToLocal(connId, message.payload);
  }
}

async function handleSubscribe(connectionId: string, userId: string, tableId: string) {
  const channel = `table:${tableId}`;
  await subscribeToChannel(connectionId, channel);

  gameClient.JoinSpectator({ table_id: tableId, user_id: userId }, (_err) => undefined);

  const [tableResult, stateResult] = await Promise.allSettled([
    grpcCall(gameClient.GetTable.bind(gameClient), { table_id: tableId }),
    grpcCall(gameClient.GetTableState.bind(gameClient), { table_id: tableId, user_id: userId }),
  ]);

  if (stateResult.status !== "fulfilled") {
    logger.error({ err: stateResult.reason, tableId }, "Failed to get table state from game service");
    return;
  }

  const table = tableResult.status === "fulfilled" ? tableResult.value : null;
  const tableStateWire = toWireTableStateView(table, (stateResult.value as { state?: unknown }).state);
  sendToLocal(connectionId, { type: "TableSnapshot", tableState: tableStateWire });

  const holeCards = (stateResult.value as { hole_cards?: unknown[] }).hole_cards;
  if (Array.isArray(holeCards) && holeCards.length > 0) {
    sendToLocal(connectionId, {
      type: "HoleCards",
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
  const ip = meta?.ip ?? "unknown";
  if (!(await checkWsRateLimit(userId, ip, "action")).ok) {
    sendToLocal(connectionId, {
      type: "ActionResult",
      tableId: payload.tableId,
      accepted: false,
      reason: "rate_limited",
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

  gameClient.SubmitAction(request, (err, response) => {
    if (err) {
      sendToLocal(connectionId, {
        type: "ActionResult",
        tableId: payload.tableId,
        accepted: false,
        reason: "internal_error",
      });
      return;
    }
    sendToLocal(connectionId, {
      type: "ActionResult",
      tableId: payload.tableId,
      accepted: response.ok,
      reason: response.error
    });
  });
}

async function handleJoinSeat(
  connectionId: string,
  userId: string,
  payload: { tableId: string; seatId: number; buyInAmount?: number },
) {
  gameClient.JoinSeat({
    table_id: payload.tableId,
    user_id: userId,
    seat_id: payload.seatId,
    buy_in_amount: payload.buyInAmount && payload.buyInAmount > 0 ? payload.buyInAmount : 200
  }, (err, response) => {
    if (err) {
      sendToLocal(connectionId, { type: "Error", message: "Internal error" });
      return;
    }
    if (!response.ok) {
      sendToLocal(connectionId, { type: "Error", message: response.error });
    }
  });
}

async function handleLeaveTable(userId: string, tableId: string) {
  gameClient.LeaveSeat({
    table_id: tableId,
    user_id: userId
  }, (err, _response) => {
    if (err) return;
  });
}

export function attachTableHub(socket: WebSocket, userId: string, connectionId: string) {
  attachWsRouter(socket, {
    hubName: "table",
    parseMessage: parseClientMessage,
    getAttributes: (message): Record<string, string> => {
      if ("tableId" in message && typeof message.tableId === "string") {
        return { "poker.table_id": message.tableId };
      }
      return {};
    },
    handlers: {
      SubscribeTable: async (message) => {
        if (message.type !== "SubscribeTable") {
          return;
        }
        await handleSubscribe(connectionId, userId, message.tableId);
      },
      UnsubscribeTable: async (message) => {
        if (message.type !== "UnsubscribeTable") {
          return;
        }
        gameClient.LeaveSpectator({ table_id: message.tableId, user_id: userId }, (_err: unknown) => undefined);
        await handleUnsubscribe(connectionId, message.tableId);
      },
      JoinSeat: async (message) => {
        if (message.type !== "JoinSeat") {
          return;
        }
        const seatId = parseSeatId(message.seatId);
        if (seatId === null) {
          return;
        }
        const buyInAmount = parseAmount(message.buyInAmount) ?? undefined;
        await handleJoinSeat(connectionId, userId, { tableId: message.tableId, seatId, buyInAmount });
      },
      LeaveTable: async (message) => {
        if (message.type !== "LeaveTable") {
          return;
        }
        await handleLeaveTable(userId, message.tableId);
      },
      Action: async (message) => {
        if (message.type !== "Action") {
          return;
        }
        const tableId = parseTableId(message.tableId);
        if (!tableId) {
          return;
        }
        const actionType = parseActionType(message.action);
        if (!actionType) {
          sendToLocal(connectionId, {
            type: "ActionResult",
            tableId,
            accepted: false,
            reason: "invalid_action",
          });
          return;
        }

        const requiresAmount = actionType === "BET" || actionType === "RAISE" || actionType === "ALL_IN";
        const amount = parseAmount(message.amount);
        if (requiresAmount && amount === null) {
          sendToLocal(connectionId, {
            type: "ActionResult",
            tableId,
            accepted: false,
            reason: "missing_amount",
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
        if (message.type !== "ResyncTable") {
          return;
        }
        await handleSubscribe(connectionId, userId, message.tableId);
      },
    },
    onClose: async () => {
      await unsubscribeAll(connectionId);
    },
  });
}
