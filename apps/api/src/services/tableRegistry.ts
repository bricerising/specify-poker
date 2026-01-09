import { randomUUID } from "crypto";

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number | null;
  maxPlayers: number;
  startingStack: number;
  bettingStructure: "NoLimit";
}

export interface TableSummary {
  tableId: string;
  name: string;
  config: TableConfig;
  seatsTaken: number;
  inProgress: boolean;
}

const tables = new Map<string, TableSummary>();

export function createTable(input: Omit<TableSummary, "tableId" | "seatsTaken" | "inProgress">) {
  const tableId = randomUUID();
  const summary: TableSummary = {
    tableId,
    name: input.name,
    config: input.config,
    seatsTaken: 0,
    inProgress: false,
  };
  tables.set(tableId, summary);
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
