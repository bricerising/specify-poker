import { startHand } from "../engine/handEngine";
import { TableSeat, TableState } from "../engine/types";
import { TableSummary } from "./tableTypes";

const tableStates = new Map<string, TableState>();

function createSeats(maxPlayers: number): TableSeat[] {
  return Array.from({ length: maxPlayers }, (_, seatId) => ({
    seatId,
    userId: null,
    stack: 0,
    status: "empty" as const,
  }));
}

export function ensureTableState(summary: TableSummary) {
  const existing = tableStates.get(summary.tableId);
  if (existing) {
    return existing;
  }

  const state: TableState = {
    tableId: summary.tableId,
    name: summary.name,
    ownerId: summary.ownerId,
    config: summary.config,
    seats: createSeats(summary.config.maxPlayers),
    status: "lobby",
    hand: null,
    version: 0,
  };

  tableStates.set(summary.tableId, state);
  return state;
}

export function getTableState(tableId: string) {
  return tableStates.get(tableId) ?? null;
}

export function listTableStates() {
  return Array.from(tableStates.values());
}

export function updateTableState(tableId: string, updater: (state: TableState) => TableState) {
  const current = tableStates.get(tableId);
  if (!current) {
    return null;
  }
  const next = updater({ ...current, seats: [...current.seats] });
  tableStates.set(tableId, next);
  return next;
}

export function resetTableStates() {
  tableStates.clear();
}

export function startHandIfReady(tableId: string) {
  return updateTableState(tableId, (state) => {
    if (state.status === "in_hand") {
      return state;
    }
    const readySeats = state.seats.filter((seat) => seat.status === "active");
    if (readySeats.length < 2) {
      return state;
    }
    return startHand(state);
  });
}
