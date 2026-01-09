import { randomUUID } from "crypto";

import { HandActionInput } from "../engine/types";
import { applyAction } from "../engine/handEngine";
import { recordHandCompletion } from "../engine/statTracker";
import { getTracer } from "../observability/otel";
import { eventStore, HandEvent } from "./eventStore";
import { getTable, updateTable } from "./tableRegistry";
import { ensureTableState, getTableState, listTableStates, startHandIfReady, updateTableState } from "./tableState";

function syncSummary(tableId: string) {
  return updateTable(tableId, (summary) => {
    const state = getTableState(tableId);
    if (!state) {
      return summary;
    }
    const seatsTaken = state.seats.filter((seat) => seat.userId && seat.status !== "empty").length;
    return {
      ...summary,
      seatsTaken,
      inProgress: state.status === "in_hand",
    };
  });
}

function recordEvent(handId: string, type: string, payload: Record<string, unknown>) {
  const event: HandEvent = {
    eventId: randomUUID(),
    handId,
    type,
    payload,
    ts: new Date().toISOString(),
  };
  eventStore.append(event);
}

export function joinSeat(options: { tableId: string; seatId: number; userId: string }) {
  const summary = getTable(options.tableId);
  if (!summary) {
    return { ok: false, reason: "missing_table" as const };
  }
  const state = ensureTableState(summary);

  const seat = state.seats.find((entry) => entry.seatId === options.seatId);
  if (!seat || seat.status !== "empty") {
    return { ok: false, reason: "seat_unavailable" as const };
  }

  seat.userId = options.userId;
  seat.stack = summary.config.startingStack;
  seat.status = "active";

  const updated = { ...state, version: state.version + 1 };
  updateTableState(state.tableId, () => updated);
  syncSummary(state.tableId);

  const handState = startHandIfReady(state.tableId);
  if (handState?.hand) {
    recordEvent(handState.hand.handId, "HandStarted", { snapshot: handState.hand });
    syncSummary(state.tableId);
  }

  return { ok: true, tableState: getTableState(state.tableId) };
}

export function leaveSeat(options: { tableId: string; userId: string }) {
  const state = getTableState(options.tableId);
  if (!state) {
    return { ok: false, reason: "missing_table" as const };
  }

  const seat = state.seats.find((entry) => entry.userId === options.userId);
  if (!seat) {
    return { ok: false, reason: "not_seated" as const };
  }

  seat.userId = null;
  seat.stack = 0;
  seat.status = "empty";

  updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
  syncSummary(state.tableId);

  return { ok: true, tableState: getTableState(state.tableId) };
}

export function applyTableAction(options: {
  tableId: string;
  seatId: number;
  action: HandActionInput;
}) {
  const state = getTableState(options.tableId);
  if (!state) {
    return { ok: false, reason: "missing_table" as const };
  }

  const previousStreet = state.hand?.currentStreet ?? null;
  const result = applyAction(state, options.seatId, options.action);
  updateTableState(options.tableId, () => result.table);
  syncSummary(options.tableId);

  if (previousStreet && result.table.hand?.currentStreet && previousStreet !== result.table.hand.currentStreet) {
    const span = getTracer().startSpan("poker.hand.transition", {
      attributes: {
        "poker.table_id": options.tableId,
        "poker.from_street": previousStreet,
        "poker.to_street": result.table.hand.currentStreet,
      },
    });
    span.end();
  }

  const handEnded = result.table.hand?.currentStreet === "ended" && previousStreet !== "ended";

  if (handEnded && result.table.hand) {
    recordHandCompletion(result.table.hand, result.table.seats);
  }

  if (result.table.hand) {
    recordEvent(result.table.hand.handId, "ActionTaken", {
      action: options.action,
      snapshot: result.table.hand,
    });

    if (result.table.hand.currentStreet === "showdown") {
      recordEvent(result.table.hand.handId, "Showdown", { snapshot: result.table.hand });
    }

    if (result.table.hand.currentStreet === "ended") {
      recordEvent(result.table.hand.handId, "HandEnded", { snapshot: result.table.hand });
    }
  }

  return { ok: result.accepted, reason: result.reason, tableState: result.table };
}

export function markSeatDisconnected(userId: string) {
  for (const state of listTableStates()) {
    const seat = state.seats.find((entry) => entry.userId === userId);
    if (seat && seat.status === "active") {
      seat.status = "disconnected";
      updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
      syncSummary(state.tableId);
    }
  }
}
