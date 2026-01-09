import WebSocket from "ws";

import { applyTableAction, joinSeat, leaveSeat } from "../services/tableService";
import { getTableState } from "../services/tableState";
import { scheduleTurnTimeout, clearTurnTimeout } from "../services/turnTimer";

interface ClientConnection {
  socket: WebSocket;
  userId: string;
  connectionId: string;
  subscriptions: Set<string>;
}

const clients = new Map<string, ClientConnection>();
const tableSubscriptions = new Map<string, Set<string>>();

function send(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastTable(tableId: string, message: Record<string, unknown>) {
  const subscribers = tableSubscriptions.get(tableId);
  if (!subscribers) {
    return;
  }
  for (const connectionId of subscribers) {
    const client = clients.get(connectionId);
    if (client) {
      send(client.socket, message);
    }
  }
}

export function broadcastTableState(tableId: string) {
  const tableState = getTableState(tableId);
  if (!tableState) {
    return;
  }
  broadcastTable(tableId, {
    type: "TablePatch",
    tableId,
    handId: tableState.hand?.handId,
    tableState,
  });
}

function scheduleTurn(tableId: string) {
  const state = getTableState(tableId);
  if (!state?.hand || state.hand.currentStreet === "ended") {
    clearTurnTimeout(tableId);
    return;
  }

  const durationMs = Number(process.env.TURN_TIMER_MS ?? 15000);
  const deadline = scheduleTurnTimeout({
    tableId,
    durationMs,
    onTimeout: () => {
      const current = getTableState(tableId);
      if (!current?.hand) {
        return;
      }
      const seatId = current.hand.currentTurnSeat;
      const action = current.hand.currentBet > (current.hand.roundContributions[seatId] ?? 0)
        ? { type: "Fold" as const }
        : { type: "Check" as const };
      const result = applyTableAction({
        tableId,
        seatId,
        action,
      });
      if (result.ok && result.tableState) {
        broadcastTable(tableId, {
          type: "TablePatch",
          tableId,
          handId: result.tableState.hand?.handId,
          tableState: result.tableState,
        });
        scheduleTurn(tableId);
      }
    },
  });

  state.hand.actionTimerDeadline = deadline.toISOString();
  broadcastTable(tableId, {
    type: "TimerUpdate",
    tableId,
    handId: state.hand.handId,
    currentTurnSeat: state.hand.currentTurnSeat,
    deadlineTs: state.hand.actionTimerDeadline,
  });
}

function handleSubscribe(client: ClientConnection, tableId: string) {
  client.subscriptions.add(tableId);
  const subscribers = tableSubscriptions.get(tableId) ?? new Set<string>();
  subscribers.add(client.connectionId);
  tableSubscriptions.set(tableId, subscribers);

  const tableState = getTableState(tableId);
  if (tableState) {
    send(client.socket, { type: "TableSnapshot", tableState });
    scheduleTurn(tableId);
  }
}

function handleUnsubscribe(client: ClientConnection, tableId: string) {
  client.subscriptions.delete(tableId);
  const subscribers = tableSubscriptions.get(tableId);
  if (!subscribers) {
    return;
  }
  subscribers.delete(client.connectionId);
  if (subscribers.size === 0) {
    tableSubscriptions.delete(tableId);
  }
}

function handleAction(client: ClientConnection, payload: {
  tableId: string;
  handId?: string;
  action: string;
  amount?: number;
}) {
  const tableId = payload.tableId;
  const tableState = getTableState(tableId);
  if (!tableState || !tableState.hand) {
    send(client.socket, {
      type: "ActionResult",
      tableId,
      handId: payload.handId,
      accepted: false,
      reason: "no_hand",
    });
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
    return;
  }

  const result = applyTableAction({
    tableId,
    seatId: seat.seatId,
    action: {
      type: payload.action as "Fold" | "Check" | "Call" | "Bet" | "Raise",
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
    broadcastTable(tableId, {
      type: "TablePatch",
      tableId,
      handId: result.tableState.hand?.handId,
      tableState: result.tableState,
    });
    scheduleTurn(tableId);
  }
}

function handleJoinSeat(client: ClientConnection, payload: { tableId: string; seatId: number }) {
  const result = joinSeat({
    tableId: payload.tableId,
    seatId: payload.seatId,
    userId: client.userId,
  });

  if (result.ok && result.tableState) {
    broadcastTable(payload.tableId, {
      type: "TablePatch",
      tableId: payload.tableId,
      handId: result.tableState.hand?.handId,
      tableState: result.tableState,
    });
    scheduleTurn(payload.tableId);
  }
}

function handleLeaveTable(client: ClientConnection, payload: { tableId: string }) {
  const result = leaveSeat({ tableId: payload.tableId, userId: client.userId });
  if (result.ok && result.tableState) {
    broadcastTable(payload.tableId, {
      type: "TablePatch",
      tableId: payload.tableId,
      handId: result.tableState.hand?.handId,
      tableState: result.tableState,
    });
  }
}

export function attachTableHub(socket: WebSocket, userId: string, connectionId: string) {
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
      return;
    }

    const type = message.type;
    if (type === "SubscribeTable") {
      handleSubscribe(client, message.tableId as string);
      return;
    }
    if (type === "UnsubscribeTable") {
      handleUnsubscribe(client, message.tableId as string);
      return;
    }
    if (type === "JoinSeat") {
      handleJoinSeat(client, {
        tableId: message.tableId as string,
        seatId: Number(message.seatId),
      });
      return;
    }
    if (type === "LeaveTable") {
      handleLeaveTable(client, { tableId: message.tableId as string });
      return;
    }
    if (type === "Action") {
      handleAction(client, {
        tableId: message.tableId as string,
        handId: message.handId as string,
        action: message.action as string,
        amount: message.amount as number | undefined,
      });
      return;
    }
  });

  socket.on("close", () => {
    for (const tableId of client.subscriptions) {
      handleUnsubscribe(client, tableId);
    }
    clients.delete(connectionId);
  });
}
