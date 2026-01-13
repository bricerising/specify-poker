import WebSocket from "ws";
import { gameClient } from "../../grpc/clients";
import { WsPubSubMessage } from "../pubsub";
import { parseActionType, parseSeatId, parseTableId, checkWsRateLimit } from "../validators";
import { subscribeToChannel, unsubscribeFromChannel, unsubscribeAll, getSubscribers } from "../subscriptions";
import { sendToLocal, getLocalConnectionMeta } from "../localRegistry";
import logger from "../../observability/logger";

function rawDataToString(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}

function parseJsonObject(data: WebSocket.RawData): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawDataToString(data));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
  gameClient.GetTableState({ table_id: tableId, user_id: userId }, (err, response) => {
    if (err) {
      logger.error({ err, tableId }, "Failed to get table state from game service");
      return;
    }
    if (response?.state) {
      sendToLocal(connectionId, { type: "TableSnapshot", tableState: response.state });
    }
    if (response?.hole_cards && response.hole_cards.length > 0) {
      sendToLocal(connectionId, {
        type: "HoleCards",
        tableId,
        handId: response.state?.hand?.hand_id,
        cards: response.hole_cards,
      });
    }
  });
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
  socket.on("message", async (data) => {
    const message = parseJsonObject(data);
    if (!message) {
      return;
    }

    const type = typeof message.type === "string" ? message.type : null;
    const tableId = parseTableId(message.tableId);

    switch (type) {
      case "SubscribeTable": {
        if (!tableId) return;
        await handleSubscribe(connectionId, userId, tableId);
        return;
      }
      case "UnsubscribeTable": {
        if (!tableId) return;
        gameClient.LeaveSpectator({ table_id: tableId, user_id: userId }, (_err: unknown) => undefined);
        await handleUnsubscribe(connectionId, tableId);
        return;
      }
      case "JoinSeat": {
        if (!tableId) return;
        const seatId = parseSeatId(message.seatId);
        if (seatId === null) return;
        const buyInAmount = parseAmount(message.buyInAmount) ?? undefined;
        await handleJoinSeat(connectionId, userId, { tableId, seatId, buyInAmount });
        return;
      }
      case "LeaveTable": {
        if (!tableId) return;
        await handleLeaveTable(userId, tableId);
        return;
      }
      case "Action": {
        if (!tableId) return;
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
        return;
      }
      case "ResyncTable": {
        if (!tableId) return;
        await handleSubscribe(connectionId, userId, tableId);
        return;
      }
      default:
        return;
    }
  });

  socket.on("close", async () => {
    await unsubscribeAll(connectionId);
  });
}
