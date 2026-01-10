import WebSocket from "ws";

import { HandState, TableSeat, TableState } from "../engine/types";
import { HandEvent } from "../services/eventStore";
import { onHandEvent } from "../services/handEvents";
import { applyTableAction, joinSeat, leaveSeat, reconnectSeat } from "../services/tableService";
import { getProfile } from "../services/profileService";
import { getTableState } from "../services/tableState";
import { notifyTurn } from "../services/pushSender";
import { scheduleTurnTimeout, clearTurnTimeout } from "../services/turnTimer";
import {
  recordActionAttempt,
  recordActionRejected,
  recordRateLimit,
  recordTurnTimeout,
  recordWsError,
  recordWsMessage,
  updateActiveTableSubscriptions,
} from "../observability/metrics";
import { WsPubSubMessage, publishTableEvent, publishTimerEvent } from "./pubsub";
import { checkWsRateLimit, parseActionType, parseSeatId, parseTableId } from "./validators";

interface ClientConnection {
  socket: WebSocket;
  userId: string;
  connectionId: string;
  subscriptions: Set<string>;
}

const clients = new Map<string, ClientConnection>();
const tableSubscriptions = new Map<string, Set<string>>();
const lastTurnNotified = new Map<string, { handId: string; seatId: number }>();
let handEventListenerAttached = false;

type TableSeatView = TableSeat & { nickname?: string };
type TableStateView = Omit<TableState, "seats"> & { seats: TableSeatView[] };

function send(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function canReceiveHoleCards(seat: TableSeat | undefined) {
  if (!seat || !seat.userId) {
    return false;
  }
  return seat.status !== "spectator" && seat.status !== "empty";
}

function redactHandSnapshot(snapshot: HandState) {
  return {
    ...snapshot,
    holeCards: {},
    deck: [],
  };
}

function redactHandEvent(event: HandEvent): HandEvent {
  const snapshot = event.payload?.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    return event;
  }
  return {
    ...event,
    payload: {
      ...event.payload,
      snapshot: redactHandSnapshot(snapshot as HandState),
    },
  };
}

async function broadcastTableLocal(tableId: string, message: Record<string, unknown>) {
  const subscribers = tableSubscriptions.get(tableId);
  if (!subscribers) {
    return;
  }
  const tableState = await getTableState(tableId);
  for (const connectionId of subscribers) {
    const client = clients.get(connectionId);
    if (client) {
      send(client.socket, message);
      if (tableState?.hand) {
        const seat = tableState.seats.find((entry) => entry.userId === client.userId);
        const holeCards = seat ? tableState.hand.holeCards[seat.seatId] : undefined;
        if (canReceiveHoleCards(seat) && holeCards && holeCards.length === 2) {
          send(client.socket, {
            type: "HoleCards",
            tableId,
            handId: tableState.hand.handId,
            seatId: seat?.seatId,
            cards: holeCards,
          });
        }
      }
    }
  }
}

export function handleTablePubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "table") {
    return;
  }
  void broadcastTableLocal(message.tableId, message.payload);
}

export function handleTimerPubSubEvent(message: WsPubSubMessage) {
  if (message.channel !== "timer") {
    return;
  }
  void broadcastTableLocal(message.tableId, message.payload);
}

async function broadcastTable(tableId: string, message: Record<string, unknown>) {
  await broadcastTableLocal(tableId, message);
  await publishTableEvent(tableId, message);
}

async function broadcastTimer(tableId: string, message: Record<string, unknown>) {
  await broadcastTableLocal(tableId, message);
  await publishTimerEvent(tableId, message);
}

function redactTableState(tableState: TableState | null) {
  if (!tableState || !tableState.hand) {
    return tableState;
  }
  const { hand } = tableState;
  return {
    ...tableState,
    hand: {
      ...hand,
      holeCards: {},
      deck: [],
    },
  };
}

async function withSeatNicknames(tableState: TableState | null): Promise<TableStateView | null> {
  if (!tableState) {
    return tableState;
  }
  const ids = Array.from(
    new Set(tableState.seats.map((seat) => seat.userId).filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) {
    return tableState as TableStateView;
  }
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const profile = await getProfile(id);
        return [id, profile.nickname] as const;
      } catch {
        return [id, id] as const;
      }
    }),
  );
  const nicknameMap = new Map(entries);
  return {
    ...tableState,
    seats: tableState.seats.map((seat) => ({
      ...seat,
      nickname: seat.userId ? nicknameMap.get(seat.userId) : undefined,
    })),
  };
}

async function buildTableStatePayload(tableState: TableState | null) {
  return withSeatNicknames(redactTableState(tableState));
}

export async function broadcastTableState(tableId: string) {
  const tableState = await getTableState(tableId);
  if (!tableState) {
    return;
  }
  const payload = await buildTableStatePayload(tableState);
  if (!payload) {
    return;
  }
  await broadcastTable(tableId, {
    type: "TablePatch",
    tableId,
    handId: tableState.hand?.handId,
    patch: payload,
  });
}

async function scheduleTurn(tableId: string) {
  const state = await getTableState(tableId);
  if (!state?.hand || state.hand.currentStreet === "ended") {
    clearTurnTimeout(tableId);
    lastTurnNotified.delete(tableId);
    return;
  }

  const { hand } = state;
  const last = lastTurnNotified.get(tableId);
  if (!last || last.handId !== hand.handId || last.seatId !== hand.currentTurnSeat) {
    const seat = state.seats.find((entry) => entry.seatId === hand.currentTurnSeat);
    if (seat?.userId && seat.status !== "spectator" && seat.status !== "empty") {
      lastTurnNotified.set(tableId, { handId: hand.handId, seatId: hand.currentTurnSeat });
      await notifyTurn(seat.userId, state.name, state.tableId, hand.currentTurnSeat);
    }
  }

  const durationMs = Number(process.env.TURN_TIMER_MS ?? 20000);
  const deadline = scheduleTurnTimeout({
    tableId,
    durationMs,
    onTimeout: async () => {
      recordTurnTimeout();
      const current = await getTableState(tableId);
      if (!current?.hand) {
        return;
      }
      const seatId = current.hand.currentTurnSeat;
      const action = current.hand.currentBet > (current.hand.roundContributions[seatId] ?? 0)
        ? { type: "Fold" as const }
        : { type: "Check" as const };
      const result = await applyTableAction({
        tableId,
        seatId,
        action,
        allowInactive: true,
      });
      if (result.ok && result.tableState) {
        const payload = await buildTableStatePayload(result.tableState);
        if (!payload) {
          return;
        }
        await broadcastTable(tableId, {
          type: "TablePatch",
          tableId,
          handId: result.tableState.hand?.handId,
          patch: payload,
        });
        await scheduleTurn(tableId);
      }
    },
  });

  state.hand.actionTimerDeadline = deadline.toISOString();
  await broadcastTimer(tableId, {
    type: "TimerUpdate",
    tableId,
    handId: state.hand.handId,
    currentTurnSeat: state.hand.currentTurnSeat,
    deadlineTs: state.hand.actionTimerDeadline,
  });
}

async function handleSubscribe(client: ClientConnection, tableId: string) {
  if (!client.subscriptions.has(tableId)) {
    client.subscriptions.add(tableId);
    updateActiveTableSubscriptions(1);
  }
  const subscribers = tableSubscriptions.get(tableId) ?? new Set<string>();
  subscribers.add(client.connectionId);
  tableSubscriptions.set(tableId, subscribers);

  const tableState = (await reconnectSeat({ tableId, userId: client.userId })) ?? (await getTableState(tableId));
  if (tableState) {
    const payload = await buildTableStatePayload(tableState);
    if (!payload) {
      return;
    }
    send(client.socket, { type: "TableSnapshot", tableState: payload });
    if (tableState.hand) {
      const seat = tableState.seats.find((entry) => entry.userId === client.userId);
      const holeCards = seat ? tableState.hand.holeCards[seat.seatId] : undefined;
      if (canReceiveHoleCards(seat) && holeCards && holeCards.length === 2) {
        send(client.socket, {
          type: "HoleCards",
          tableId,
          handId: tableState.hand.handId,
          seatId: seat?.seatId,
          cards: holeCards,
        });
      }
    }
    await scheduleTurn(tableId);
  }
}

function handleUnsubscribe(client: ClientConnection, tableId: string) {
  if (client.subscriptions.delete(tableId)) {
    updateActiveTableSubscriptions(-1);
  }
  const subscribers = tableSubscriptions.get(tableId);
  if (!subscribers) {
    return;
  }
  subscribers.delete(client.connectionId);
  if (subscribers.size === 0) {
    tableSubscriptions.delete(tableId);
  }
}

async function handleAction(client: ClientConnection, payload: {
  tableId: string;
  handId?: string;
  action: string;
  amount?: number;
}) {
  recordActionAttempt();
  const tableId = payload.tableId;
  const tableState = await getTableState(tableId);
  if (!tableState || !tableState.hand) {
    send(client.socket, {
      type: "ActionResult",
      tableId,
      handId: payload.handId,
      accepted: false,
      reason: "no_hand",
    });
    recordActionRejected("no_hand");
    return;
  }

  const seat = tableState.seats.find((entry) => entry.userId === client.userId);
  if (!seat) {
    send(client.socket, {
      type: "ActionResult",
      tableId,
      handId: payload.handId,
      accepted: false,
      reason: "not_seated",
    });
    recordActionRejected("not_seated");
    return;
  }

  const rate = checkWsRateLimit(client.connectionId, "action");
  if (!rate.ok) {
    send(client.socket, {
      type: "ActionResult",
      tableId,
      handId: payload.handId,
      accepted: false,
      reason: "rate_limited",
    });
    recordRateLimit("ws_action");
    recordActionRejected("rate_limited");
    return;
  }

  const actionType = parseActionType(payload.action);
  if (!actionType) {
    send(client.socket, {
      type: "ActionResult",
      tableId,
      handId: payload.handId,
      accepted: false,
      reason: "invalid_action",
    });
    recordActionRejected("invalid_action");
    return;
  }

  const result = await applyTableAction({
    tableId,
    seatId: seat.seatId,
    action: {
      type: actionType as "Fold" | "Check" | "Call" | "Bet" | "Raise",
      amount: payload.amount,
    },
  });

  send(client.socket, {
    type: "ActionResult",
    tableId,
    handId: tableState.hand.handId,
    accepted: result.ok,
    reason: result.reason,
  });

  if (result.ok && result.tableState) {
    const payload = await buildTableStatePayload(result.tableState);
    if (!payload) {
      return;
    }
    await broadcastTable(tableId, {
      type: "TablePatch",
      tableId,
      handId: result.tableState.hand?.handId,
      patch: payload,
    });
    await scheduleTurn(tableId);
  }
}

async function handleJoinSeat(client: ClientConnection, payload: { tableId: string; seatId: number }) {
  const result = await joinSeat({
    tableId: payload.tableId,
    seatId: payload.seatId,
    userId: client.userId,
  });

  if (result.ok && result.tableState) {
    const payload = await buildTableStatePayload(result.tableState);
    if (!payload) {
      return;
    }
    await broadcastTable(payload.tableId, {
      type: "TablePatch",
      tableId: payload.tableId,
      handId: result.tableState.hand?.handId,
      patch: payload,
    });
    await scheduleTurn(payload.tableId);
  }
}

async function handleLeaveTable(client: ClientConnection, payload: { tableId: string }) {
  const result = await leaveSeat({ tableId: payload.tableId, userId: client.userId });
  if (result.ok && result.tableState) {
    const payload = await buildTableStatePayload(result.tableState);
    if (!payload) {
      return;
    }
    await broadcastTable(payload.tableId, {
      type: "TablePatch",
      tableId: payload.tableId,
      handId: result.tableState.hand?.handId,
      patch: payload,
    });
  }
}

async function handleResync(client: ClientConnection, tableId: string) {
  const tableState = (await reconnectSeat({ tableId, userId: client.userId })) ?? (await getTableState(tableId));
  if (!tableState) {
    return;
  }
  const payload = await buildTableStatePayload(tableState);
  if (!payload) {
    return;
  }
  send(client.socket, { type: "TableSnapshot", tableState: payload });
  if (tableState.hand) {
    const seat = tableState.seats.find((entry) => entry.userId === client.userId);
    const holeCards = seat ? tableState.hand.holeCards[seat.seatId] : undefined;
    if (canReceiveHoleCards(seat) && holeCards && holeCards.length === 2) {
      send(client.socket, {
        type: "HoleCards",
        tableId,
        handId: tableState.hand.handId,
        seatId: seat?.seatId,
        cards: holeCards,
      });
    }
  }
  await scheduleTurn(tableId);
}

export function attachTableHub(socket: WebSocket, userId: string, connectionId: string) {
  if (!handEventListenerAttached) {
    onHandEvent((notification) => {
      const sanitized = redactHandEvent(notification.event);
      void broadcastTable(notification.tableId, {
        type: "HandEvent",
        tableId: notification.tableId,
        handId: notification.handId,
        event: sanitized,
      });
    });
    handEventListenerAttached = true;
  }
  const client: ClientConnection = {
    socket,
    userId,
    connectionId,
    subscriptions: new Set(),
  };
  clients.set(connectionId, client);

  socket.on("message", (data) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data.toString());
    } catch {
      recordWsError("invalid_json");
      return;
    }

    const type = message.type;
    if (type === "SubscribeTable") {
      recordWsMessage("SubscribeTable");
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        recordWsError("invalid_table");
        send(client.socket, { type: "Error", code: "invalid_table", message: "Missing tableId" });
        return;
      }
      void handleSubscribe(client, tableId);
      return;
    }
    if (type === "UnsubscribeTable") {
      recordWsMessage("UnsubscribeTable");
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        return;
      }
      handleUnsubscribe(client, tableId);
      return;
    }
    if (type === "JoinSeat") {
      recordWsMessage("JoinSeat");
      const tableId = parseTableId(message.tableId);
      const seatId = parseSeatId(message.seatId);
      if (!tableId || seatId === null) {
        recordWsError("invalid_seat");
        send(client.socket, { type: "Error", code: "invalid_seat", message: "Invalid seat" });
        return;
      }
      void handleJoinSeat(client, {
        tableId,
        seatId,
      });
      return;
    }
    if (type === "LeaveTable") {
      recordWsMessage("LeaveTable");
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        return;
      }
      void handleLeaveTable(client, { tableId });
      return;
    }
    if (type === "Action") {
      recordWsMessage("Action");
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        recordActionRejected("invalid_table");
        send(client.socket, { type: "ActionResult", accepted: false, reason: "invalid_table" });
        return;
      }
      void handleAction(client, {
        tableId,
        handId: message.handId as string,
        action: message.action as string,
        amount: message.amount as number | undefined,
      });
      return;
    }
    if (type === "ResyncTable") {
      recordWsMessage("ResyncTable");
      const tableId = parseTableId(message.tableId);
      if (!tableId) {
        return;
      }
      void handleResync(client, tableId);
    }
  });

  socket.on("close", () => {
    for (const tableId of client.subscriptions) {
      handleUnsubscribe(client, tableId);
    }
    clients.delete(connectionId);
  });
}
