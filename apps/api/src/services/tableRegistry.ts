import { randomUUID } from "crypto";

import { getRedisClient } from "./redisClient";
import { ensureTableState } from "./tableState";
import { TableSummary } from "./tableTypes";

const tables = new Map<string, TableSummary>();
const TABLES_KEY = "poker:tables";

function cacheTable(summary: TableSummary) {
  tables.set(summary.tableId, summary);
  return summary;
}

export async function createTable(
  input: Omit<TableSummary, "tableId" | "seatsTaken" | "inProgress">,
) {
  const tableId = randomUUID();
  const summary: TableSummary = {
    tableId,
    name: input.name,
    ownerId: input.ownerId,
    config: input.config,
    seatsTaken: 0,
    inProgress: false,
  };
  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(TABLES_KEY, tableId, JSON.stringify(summary));
  }
  cacheTable(summary);
  await ensureTableState(summary);
  return summary;
}

export async function listTables() {
  const redis = await getRedisClient();
  if (!redis) {
    return Array.from(tables.values());
  }
  const entries = await redis.hGetAll(TABLES_KEY);
  const list = Object.values(entries).map((value) => JSON.parse(value) as TableSummary);
  list.forEach((summary) => cacheTable(summary));
  return list;
}

export async function getTable(tableId: string) {
  const cached = tables.get(tableId);
  if (cached) {
    return cached;
  }
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }
  const payload = await redis.hGet(TABLES_KEY, tableId);
  if (!payload) {
    return null;
  }
  return cacheTable(JSON.parse(payload) as TableSummary);
}

export async function updateTable(tableId: string, updater: (table: TableSummary) => TableSummary) {
  const current = await getTable(tableId);
  if (!current) {
    return null;
  }
  const next = updater(current);
  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(TABLES_KEY, tableId, JSON.stringify(next));
  }
  cacheTable(next);
  return next;
}

export async function resetTables() {
  tables.clear();
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(TABLES_KEY);
  }
}

export async function createDefaultTable() {
  const existing = await listTables();
  if (existing.length > 0) {
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
