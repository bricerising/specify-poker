import { TablePot } from "../domain/types";
import logger from "../observability/logger";
import { tryJsonParse } from "../utils/json";
import { getRedisClient } from "./redisClient";

const POTS_PREFIX = "balance:pots:";
const POTS_ACTIVE_KEY = "balance:pots:active";

// In-memory cache
const tablePots = new Map<string, TablePot>();

function getPotKey(tableId: string, handId: string): string {
  return `${tableId}:${handId}`;
}

export async function getTablePot(tableId: string, handId: string): Promise<TablePot | null> {
  const key = getPotKey(tableId, handId);

  const cached = tablePots.get(key);
  if (cached) {
    return cached;
  }

  const redis = await getRedisClient();
  if (redis) {
    const payload = await redis.get(`${POTS_PREFIX}${key}`);
    if (payload) {
      const parsed = tryJsonParse<TablePot>(payload);
      if (!parsed.ok) {
        logger.warn({ err: parsed.error, tableId, handId }, "tablePotStore.parse.failed");
        return null;
      }
      const pot = parsed.value;
      tablePots.set(key, pot);
      return pot;
    }
  }

  return null;
}

export async function saveTablePot(pot: TablePot): Promise<void> {
  const key = getPotKey(pot.tableId, pot.handId);
  tablePots.set(key, pot);

  const redis = await getRedisClient();
  if (redis) {
    await redis.set(`${POTS_PREFIX}${key}`, JSON.stringify(pot));

    if (pot.status === "ACTIVE") {
      await redis.sAdd(POTS_ACTIVE_KEY, key);
    } else {
      await redis.sRem(POTS_ACTIVE_KEY, key);
    }
  }
}

export async function updateTablePot(
  tableId: string,
  handId: string,
  updater: (current: TablePot) => TablePot
): Promise<TablePot | null> {
  const current = await getTablePot(tableId, handId);
  if (!current) {
    return null;
  }

  const updated = updater(current);
  updated.version = current.version + 1;

  await saveTablePot(updated);
  return updated;
}

export async function getActivePots(): Promise<TablePot[]> {
  const redis = await getRedisClient();
  if (redis) {
    const keys = await redis.sMembers(POTS_ACTIVE_KEY);
    const result: TablePot[] = [];
    for (const key of keys) {
      const [tableId, handId] = key.split(":");
      const pot = await getTablePot(tableId, handId);
      if (pot && pot.status === "ACTIVE") {
        result.push(pot);
      }
    }
    return result;
  }

  return Array.from(tablePots.values()).filter((p) => p.status === "ACTIVE");
}

export async function deleteTablePot(tableId: string, handId: string): Promise<void> {
  const key = getPotKey(tableId, handId);
  tablePots.delete(key);

  const redis = await getRedisClient();
  if (redis) {
    await redis.del(`${POTS_PREFIX}${key}`);
    await redis.sRem(POTS_ACTIVE_KEY, key);
  }
}

export async function resetTablePots(): Promise<void> {
  tablePots.clear();

  const redis = await getRedisClient();
  if (redis) {
    const keys = await redis.sMembers(POTS_ACTIVE_KEY);
    for (const key of keys) {
      await redis.del(`${POTS_PREFIX}${key}`);
    }
    await redis.del(POTS_ACTIVE_KEY);
  }
}
