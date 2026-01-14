import redisClient from "./redisClient";
import { TableState } from "../domain/types";

const STATE_PREFIX = "game:state:";
const STATE_LOCK_PREFIX = "game:state:lock:";

export class TableStateStore {
  async save(state: TableState): Promise<void> {
    const key = `${STATE_PREFIX}${state.tableId}`;
    await redisClient.set(key, JSON.stringify(state));
  }

  async get(tableId: string): Promise<TableState | null> {
    const key = `${STATE_PREFIX}${tableId}`;
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  async delete(tableId: string): Promise<void> {
    const key = `${STATE_PREFIX}${tableId}`;
    await redisClient.del(key);
  }

  async lock(tableId: string, owner: string, ttlMs = 5000): Promise<boolean> {
    const key = `${STATE_LOCK_PREFIX}${tableId}`;
    const result = await redisClient.set(key, owner, { NX: true, PX: ttlMs });
    return result === "OK";
  }

  async unlock(tableId: string, owner: string): Promise<void> {
    const key = `${STATE_LOCK_PREFIX}${tableId}`;
    const current = await redisClient.get(key);
    if (current === owner) {
      await redisClient.del(key);
    }
  }
}

export const tableStateStore = new TableStateStore();
