import WebSocket from "ws";
import { gameClient } from "../../grpc/clients";
import { WsPubSubMessage } from "../pubsub";
import { parseActionType, parseSeatId, parseTableId, checkWsRateLimit } from "../validators";
import { subscribeToChannel, unsubscribeFromChannel, unsubscribeAll, getSubscribers } from "../subscriptions";
import { sendToLocal, getLocalConnectionMeta } from "../localRegistry";
import logger from "../../observability/logger";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAction(connectionId: string, userId: string, payload: any) {
  const meta = getLocalConnectionMeta(connectionId);
  const ip = meta?.ip ?? "unknown";
  if (!(await checkWsRateLimit(userId, ip, "action")).ok) {
    sendToLocal(connectionId, { type: "ActionResult", accepted: false, reason: "rate_limited" });
    return;
  }

  const actionType = parseActionType(payload.action);
  if (!actionType) {
    sendToLocal(connectionId, { type: "ActionResult", accepted: false, reason: "invalid_action" });
    return;
  }

  gameClient.SubmitAction({
    table_id: payload.tableId,
    user_id: userId,
    action_type: actionType,
    amount: payload.amount
  }, (err, response) => {
    if (err) {
      sendToLocal(connectionId, { type: "ActionResult", accepted: false, reason: "internal_error" });
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleJoinSeat(connectionId: string, userId: string, payload: any) {
  gameClient.JoinSeat({
    table_id: payload.tableId,
    user_id: userId,
    seat_id: payload.seatId,
    buy_in_amount: payload.buyInAmount || 200
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLeaveTable(userId: string, payload: any) {
  gameClient.LeaveSeat({
    table_id: payload.tableId,
    user_id: userId
  }, (err, _response) => {
    if (err) return;
  });
}

export function attachTableHub(socket: WebSocket, userId: string, connectionId: string) {
  socket.on("message", async (data) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let message: any;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    const type = message.type;
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
        await handleJoinSeat(connectionId, userId, { tableId, seatId, buyInAmount: message.buyInAmount });
        return;
      }
      case "LeaveTable": {
        if (!tableId) return;
        await handleLeaveTable(userId, { tableId });
        return;
      }
      case "Action": {
        if (!tableId) return;
        await handleAction(connectionId, userId, message);
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
