import { startHand } from "../engine/handEngine";
import { TableSeat, TableState } from "../engine/types";
import { getRedisClient } from "./redisClient";
import { TableSummary } from "./tableTypes";

const tableStates = new Map<string, TableState>();
const TABLE_STATE_KEY = "poker:tableState";
const TABLE_STATE_IDS_KEY = "poker:tableState:ids";

function createSeats(maxPlayers: number): TableSeat[] {
  return Array.from({ length: maxPlayers }, (_, seatId) => ({
    seatId,
    userId: null,
    stack: 0,
    status: "empty" as const,
  }));
}

function cacheState(state: TableState) {
  tableStates.set(state.tableId, state);
  return state;
}

function getStateKey(tableId: string) {
  return `${TABLE_STATE_KEY}:${tableId}`;
}

export async function ensureTableState(summary: TableSummary) {
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

  const redis = await getRedisClient();
  if (redis) {
    await redis.set(getStateKey(summary.tableId), JSON.stringify(state));
    await redis.sAdd(TABLE_STATE_IDS_KEY, summary.tableId);
  }

  return cacheState(state);
}

export async function getTableState(tableId: string) {
  const cached = tableStates.get(tableId);
  if (cached) {
    return cached;
  }
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }
  const payload = await redis.get(getStateKey(tableId));
  if (!payload) {
    return null;
  }
  return cacheState(JSON.parse(payload) as TableState);
}

export async function listTableStates() {
  const redis = await getRedisClient();
  if (!redis) {
    return Array.from(tableStates.values());
  }
  const tableIds = await redis.sMembers(TABLE_STATE_IDS_KEY);
  const entries = await Promise.all(
    tableIds.map(async (tableId) => {
      const payload = await redis.get(getStateKey(tableId));
      return payload ? (JSON.parse(payload) as TableState) : null;
    }),
  );
  const list = entries.filter((entry): entry is TableState => Boolean(entry));
  list.forEach((state) => cacheState(state));
  return list;
}

export async function updateTableState(
  tableId: string,
  updater: (state: TableState) => TableState,
) {
  const current = await getTableState(tableId);
  if (!current) {
    return null;
  }
  const next = updater({ ...current, seats: [...current.seats] });
  const redis = await getRedisClient();
  if (redis) {
    await redis.set(getStateKey(tableId), JSON.stringify(next));
    await redis.sAdd(TABLE_STATE_IDS_KEY, tableId);
  }
  return cacheState(next);
}

export async function resetTableStates() {
  tableStates.clear();
  const redis = await getRedisClient();
  if (redis) {
    const tableIds = await redis.sMembers(TABLE_STATE_IDS_KEY);
    const keys = tableIds.map((tableId) => getStateKey(tableId));
    if (keys.length > 0) {
      await redis.del(keys);
    }
    await redis.del(TABLE_STATE_IDS_KEY);
  }
}

export async function startHandIfReady(tableId: string) {
  return updateTableState(tableId, (state) => {
    if (state.status === "in_hand") {
      return state;
    }
    let promoted = false;
    const seats = state.seats.map((seat) => {
      if (seat.status === "spectator") {
        promoted = true;
        return { ...seat, status: "active" as const };
      }
      return seat;
    });
    const nextState = promoted ? { ...state, seats } : state;
    const readySeats = nextState.seats.filter((seat) => seat.status === "active");
    if (readySeats.length < 2) {
      return nextState;
    }
    return startHand(nextState);
  });
}
