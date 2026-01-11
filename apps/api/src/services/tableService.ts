import { randomUUID } from "crypto";

import { HandActionInput } from "../engine/types";
import { applyAction } from "../engine/handEngine";
import { recordHandCompletion } from "../engine/statTracker";
import {
  recordActionResult,
  recordAllinAction,
  recordDecisionTime,
  recordFoldToRaise,
  recordHandEnded,
  recordHandShowdown,
  recordHandStarted,
  recordHandWon,
  recordPfrAction,
  recordSeatJoinFailure,
  recordShowdownWin,
  recordTableJoin,
  recordTableLeave,
  recordTableReconnect,
  recordVpipAction,
} from "../observability/metrics";
import { getTracer } from "../observability/otel";
import { eventStore, HandEvent } from "./eventStore";
import { emitHandEvent } from "./handEvents";
import { getTable, updateTable } from "./tableRegistry";
import { ensureTableState, getTableState, listTableStates, startHandIfReady, updateTableState } from "./tableState";
import {
  isBalanceServiceEnabled,
  reserveForBuyIn,
  commitReservation,
  releaseReservation,
  processCashOut,
} from "../clients/balanceClient";

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

async function recordEvent(tableId: string, handId: string, type: string, payload: Record<string, unknown>) {
  const event: HandEvent = {
    eventId: randomUUID(),
    handId,
    type,
    payload,
    ts: new Date().toISOString(),
  };
  await eventStore.append(event);
  emitHandEvent({ tableId, handId, event });
}

export async function joinSeat(options: { tableId: string; seatId: number; userId: string }) {
  const summary = await getTable(options.tableId);
  if (!summary) {
    recordSeatJoinFailure("missing_table");
    return { ok: false, reason: "missing_table" as const };
  }
  const state = await ensureTableState(summary);

  const seat = state.seats.find((entry) => entry.seatId === options.seatId);
  if (!seat) {
    recordSeatJoinFailure("seat_unavailable");
    return { ok: false, reason: "seat_unavailable" as const };
  }

  const existingSeat = state.seats.find((entry) => entry.userId === options.userId);
  if (existingSeat) {
    if (existingSeat.seatId === options.seatId && existingSeat.status === "disconnected") {
      seat.status = "active";
      await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
      await syncSummary(state.tableId);
      recordTableReconnect();
      return { ok: true, tableState: await getTableState(state.tableId) };
    }
    recordSeatJoinFailure("already_seated");
    return { ok: false, reason: "already_seated" as const };
  }

  if (seat.userId === options.userId && seat.status === "disconnected") {
    seat.status = "active";
    await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
    await syncSummary(state.tableId);
    recordTableReconnect();
    return { ok: true, tableState: await getTableState(state.tableId) };
  }

  if (seat.status !== "empty") {
    recordSeatJoinFailure("seat_taken");
    return { ok: false, reason: "seat_unavailable" as const };
  }

  // Two-phase buy-in: Reserve funds before joining
  const buyInAmount = summary.config.startingStack;
  const idempotencyKey = `join:${options.tableId}:${options.userId}:${Date.now()}`;
  let reservationId: string | null = null;

  if (isBalanceServiceEnabled()) {
    const reservation = await reserveForBuyIn(
      options.userId,
      options.tableId,
      buyInAmount,
      idempotencyKey
    );

    if (!reservation.ok) {
      recordSeatJoinFailure("insufficient_balance");
      return { ok: false, reason: "insufficient_balance" as const };
    }

    reservationId = reservation.reservation_id;
  }

  try {
    // Assign seat
    seat.userId = options.userId;
    seat.stack = buyInAmount;
    seat.status = state.status === "in_hand" ? "spectator" : "active";

    const updated = { ...state, version: state.version + 1 };
    await updateTableState(state.tableId, () => updated);
    await syncSummary(state.tableId);
    recordTableJoin();

    // Commit the reservation on successful seat assignment
    if (reservationId) {
      await commitReservation(reservationId);
    }

    const handState = await startHandIfReady(state.tableId);
    if (handState?.hand) {
      await recordEvent(state.tableId, handState.hand.handId, "HandStarted", { snapshot: handState.hand });
      recordHandStarted(handState.hand.handId);
      await syncSummary(state.tableId);
    }

    return { ok: true, tableState: await getTableState(state.tableId) };
  } catch (error) {
    // Release reservation on failure
    if (reservationId) {
      await releaseReservation(reservationId, "seat_join_failed");
    }
    throw error;
  }
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

  // Process cash-out before clearing seat
  const cashOutAmount = seat.stack;
  if (cashOutAmount > 0 && isBalanceServiceEnabled()) {
    const idempotencyKey = `leave:${options.tableId}:${options.userId}:${Date.now()}`;
    await processCashOut(
      options.userId,
      options.tableId,
      seat.seatId,
      cashOutAmount,
      idempotencyKey
    );
  }

  seat.userId = null;
  seat.stack = 0;
  seat.status = "empty";

  await updateTableState(state.tableId, () => ({ ...state, version: state.version + 1 }));
  await syncSummary(state.tableId);
  recordTableLeave();

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

  const actionSpan = getTracer().startSpan("poker.action", {
    attributes: {
      "poker.table_id": options.tableId,
      "poker.seat_id": options.seatId,
      "poker.action_type": options.action.type,
      "poker.action_amount": options.action.amount ?? 0,
      "poker.action_accepted": result.accepted,
      "poker.action_reason": result.reason ?? "",
    },
  });
  actionSpan.end();
  recordActionResult(options.action.type, result.accepted, result.reason ?? undefined);

  // Record player quality metrics when action is accepted
  if (result.accepted && state.hand) {
    const actionType = options.action.type;
    const currentStreet = previousStreet;
    const currentBet = state.hand.currentBet ?? 0;
    const playerContribution = state.hand.roundContributions[options.seatId] ?? 0;

    // VPIP: Voluntary Put money In Pot (Call, Bet, Raise - not posting blinds)
    if (actionType === "Call" || actionType === "Bet" || actionType === "Raise") {
      recordVpipAction();
    }

    // PFR: Pre-Flop Raise
    if (currentStreet === "preflop" && actionType === "Raise") {
      recordPfrAction();
    }

    // All-in detection: when player puts all their chips in
    const seat = state.seats.find((s) => s.seatId === options.seatId);
    if (seat && options.action.amount && options.action.amount >= seat.stack) {
      recordAllinAction();
    }

    // Fold to raise: player folds when facing a bet/raise
    if (actionType === "Fold" && currentBet > playerContribution) {
      recordFoldToRaise();
    }
  }

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
    const totalPot = result.table.hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
    const winners = result.table.hand.winners ?? [];
    const outcomeSpan = getTracer().startSpan("poker.hand.outcome", {
      attributes: {
        "poker.table_id": options.tableId,
        "poker.hand_id": result.table.hand.handId,
        "poker.total_pot": totalPot,
        "poker.winner_count": winners.length,
        "poker.winner_seats": winners.join(","),
      },
    });
    outcomeSpan.end();
    recordHandEnded(result.table.hand.handId);
    await recordHandCompletion(result.table.hand, result.table.seats);

    // Record win metrics
    for (const winnerSeat of winners) {
      recordHandWon();
    }
    // Track showdown wins vs non-showdown wins
    const wasShowdown = previousStreet === "showdown" || result.table.hand.currentStreet === "showdown";
    if (wasShowdown) {
      for (const winnerSeat of winners) {
        recordShowdownWin();
      }
    }
  }

  if (result.table.hand) {
    await recordEvent(options.tableId, result.table.hand.handId, "ActionTaken", {
      action: options.action,
      snapshot: result.table.hand,
    });

    if (result.table.hand.currentStreet === "showdown") {
      await recordEvent(options.tableId, result.table.hand.handId, "Showdown", {
        snapshot: result.table.hand,
      });
      recordHandShowdown();
    }

    if (result.table.hand.currentStreet === "ended") {
      await recordEvent(options.tableId, result.table.hand.handId, "HandEnded", {
        snapshot: result.table.hand,
      });
    }
  }

  let finalState = result.table;
  if (handEnded) {
    const nextState = await startHandIfReady(options.tableId);
    if (nextState?.hand && nextState.hand.handId !== result.table.hand?.handId) {
      await recordEvent(options.tableId, nextState.hand.handId, "HandStarted", {
        snapshot: nextState.hand,
      });
      recordHandStarted(nextState.hand.handId);
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
  recordTableReconnect();
  return getTableState(state.tableId);
}
