import { apiFetch } from "./apiClient";
import { normalizeTableSummary } from "../state/tableNormalization";
import type { TableSummary } from "../state/tableTypes";
import { asRecord } from "../utils/unknown";

export interface CreateTableInput {
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  startingStack: number;
}

function decodeTableSummary(payload: unknown): TableSummary {
  const record = asRecord(payload);
  if (!record) {
    throw new Error("Invalid table response");
  }
  return normalizeTableSummary(record);
}

export async function listTables() {
  const response = await apiFetch("/api/tables");
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Invalid tables response");
  }
  return payload.map(decodeTableSummary);
}

export async function createTable(input: CreateTableInput) {
  const response = await apiFetch("/api/tables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      config: {
        smallBlind: input.smallBlind,
        bigBlind: input.bigBlind,
        maxPlayers: input.maxPlayers,
        startingStack: input.startingStack,
      },
    }),
  });

  return decodeTableSummary(await response.json());
}
