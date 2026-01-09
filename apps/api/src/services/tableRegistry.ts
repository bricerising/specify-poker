import { randomUUID } from "crypto";

import { ensureTableState } from "./tableState";
import { TableSummary } from "./tableTypes";

const tables = new Map<string, TableSummary>();

export function createTable(input: Omit<TableSummary, "tableId" | "seatsTaken" | "inProgress">) {
  const tableId = randomUUID();
  const summary: TableSummary = {
    tableId,
    name: input.name,
    ownerId: input.ownerId,
    config: input.config,
    seatsTaken: 0,
    inProgress: false,
  };
  tables.set(tableId, summary);
  ensureTableState(summary);
  return summary;
}

export function listTables() {
  return Array.from(tables.values());
}

export function getTable(tableId: string) {
  return tables.get(tableId) ?? null;
}

export function updateTable(tableId: string, updater: (table: TableSummary) => TableSummary) {
  const current = tables.get(tableId);
  if (!current) {
    return null;
  }
  const next = updater(current);
  tables.set(tableId, next);
  return next;
}

export function resetTables() {
  tables.clear();
}

export function createDefaultTable() {
  if (tables.size > 0) {
    return null;
  }
  return createTable({
    name: "Main Table",
    ownerId: "system",
    config: {
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 6,
      startingStack: 500,
      bettingStructure: "NoLimit",
    },
  });
}
