import { randomUUID } from "crypto";

import { HandActionInput } from "../engine/types";
import { applyAction } from "../engine/handEngine";
import { recordHandCompletion } from "../engine/statTracker";
import { getTracer } from "../observability/otel";
import { eventStore, HandEvent } from "./eventStore";
import { getTable, updateTable } from "./tableRegistry";
import { ensureTableState, getTableState, listTableStates, startHandIfReady, updateTableState } from "./tableState";

async function syncSummary(tableId: string) {
  const state = await getTableState(tableId);
  return updateTable(tableId, (summary) => {
    if (!state) {
      return summary;
    }
    const occupiedSeats = state.seats.filter((seat) => seat.userId && seat.status !== "empty");
    const seatsTaken = occupiedSeats.length;
    return {
      ...summary,
      seatsTaken,
      occupiedSeatIds: occupiedSeats.map((seat) => seat.seatId),
      inProgress: state.status === "in_hand",
    };
  });
}

async function recordEvent(handId: string, type: string, payload: Record<string, unknown>) {
  const event: HandEvent = {
    eventId: randomUUID(),
    handId,
    type,
    payload,
    ts: new Date().toISOString(),
  };
  await eventStore.append(event);
}

export async function joinSeat(options: { tableId: string; seatId: number; userId: string }) {
  const summary = await getTable(options.tableId);
  if (!summary) {
    return { ok: false, reason: "missing_table" as const };
  }
  const state = await ensureTableState(summary);

  const seat = state.seats.find((entry) => entry.seatId === options.seatId);
  if (!seat) {
    return { ok: false, reason: "seat_unavailable" as const };
  }

  const existingSeat = state.seats.find((entry) => entry.userId === options.userId);
  if (existingSeat) {
    if (existingSeat.seatId === options.seatId && existingSeat.status === "disconnected") {
      seat.status = "active";
      await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
      await syncSummary(state.tableId);
      return { ok: true, tableState: await getTableState(state.tableId) };
    }
    return { ok: false, reason: "already_seated" as const };
  }

  if (seat.userId === options.userId && seat.status === "disconnected") {
    seat.status = "active";
    await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
    await syncSummary(state.tableId);
    return { ok: true, tableState: await getTableState(state.tableId) };
  }

  if (seat.status !== "empty") {
    return { ok: false, reason: "seat_unavailable" as const };
  }

  seat.userId = options.userId;
  seat.stack = summary.config.startingStack;
  seat.status = "active";

  const updated = { ...state, version: state.version + 1 };
  await updateTableState(state.tableId, () => updated);
  await syncSummary(state.tableId);

  const handState = await startHandIfReady(state.tableId);
  if (handState?.hand) {
    await recordEvent(handState.hand.handId, "HandStarted", { snapshot: handState.hand });
    await syncSummary(state.tableId);
  }

  return { ok: true, tableState: await getTableState(state.tableId) };
}

export async function leaveSeat(options: { tableId: string; userId: string }) {
  const state = await getTableState(options.tableId);
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

  await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
  await syncSummary(state.tableId);

  return { ok: true, tableState: await getTableState(state.tableId) };
}

export async function applyTableAction(options: {
  tableId: string;
  seatId: number;
  action: HandActionInput;
  allowInactive?: boolean;
}) {
  const state = await getTableState(options.tableId);
  if (!state) {
    return { ok: false, reason: "missing_table" as const };
  }

  const previousStreet = state.hand?.currentStreet ?? null;
  const result = applyAction(state, options.seatId, options.action, {
    allowInactive: options.allowInactive,
  });
  await updateTableState(options.tableId, () => result.table);
  await syncSummary(options.tableId);

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
    await recordHandCompletion(result.table.hand, result.table.seats);
  }

  if (result.table.hand) {
    await recordEvent(result.table.hand.handId, "ActionTaken", {
      action: options.action,
      snapshot: result.table.hand,
    });

    if (result.table.hand.currentStreet === "showdown") {
      await recordEvent(result.table.hand.handId, "Showdown", { snapshot: result.table.hand });
    }

    if (result.table.hand.currentStreet === "ended") {
      await recordEvent(result.table.hand.handId, "HandEnded", { snapshot: result.table.hand });
    }
  }

  let finalState = result.table;
  if (handEnded) {
    const nextState = await startHandIfReady(options.tableId);
    if (nextState?.hand && nextState.hand.handId !== result.table.hand?.handId) {
      await recordEvent(nextState.hand.handId, "HandStarted", { snapshot: nextState.hand });
      finalState = nextState;
      await syncSummary(options.tableId);
    }
  }

  return { ok: result.accepted, reason: result.reason, tableState: finalState };
}

export async function markSeatDisconnected(userId: string) {
  const states = await listTableStates();
  for (const state of states) {
    const seat = state.seats.find((entry) => entry.userId === userId);
    if (seat && seat.status === "active") {
      seat.status = "disconnected";
      await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
      await syncSummary(state.tableId);
    }
  }
}

export async function reconnectSeat(options: { tableId: string; userId: string }) {
  const state = await getTableState(options.tableId);
  if (!state) {
    return null;
  }
  const seat = state.seats.find((entry) => entry.userId === options.userId);
  if (!seat || seat.status !== "disconnected") {
    return state;
  }
  seat.status = "active";
  await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
  await syncSummary(state.tableId);
  return getTableState(state.tableId);
}
