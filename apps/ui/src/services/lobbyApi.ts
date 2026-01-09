import { apiFetch } from "./apiClient";
import { TableSummary } from "../state/tableStore";

export interface CreateTableInput {
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  startingStack: number;
}

export async function listTables() {
  const response = await apiFetch("/api/tables");
  return (await response.json()) as TableSummary[];
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

  return (await response.json()) as TableSummary;
}
