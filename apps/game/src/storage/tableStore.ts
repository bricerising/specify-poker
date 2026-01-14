import redisClient from "./redisClient";
import { Table } from "../domain/types";

const TABLE_PREFIX = "game:tables:";
const TABLE_IDS_KEY = "game:tables:ids";
const TABLE_BY_OWNER_PREFIX = "game:tables:by-owner:";

export class TableStore {
  async save(table: Table): Promise<void> {
    const key = `${TABLE_PREFIX}${table.tableId}`;
    await redisClient.set(key, JSON.stringify(table));
    await redisClient.sAdd(TABLE_IDS_KEY, table.tableId);
    await redisClient.sAdd(`${TABLE_BY_OWNER_PREFIX}${table.ownerId}`, table.tableId);
  }

  async get(tableId: string): Promise<Table | null> {
    const key = `${TABLE_PREFIX}${tableId}`;
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  async list(): Promise<string[]> {
    return await redisClient.sMembers(TABLE_IDS_KEY);
  }

  async getByOwner(ownerId: string): Promise<string[]> {
    return await redisClient.sMembers(`${TABLE_BY_OWNER_PREFIX}${ownerId}`);
  }

  async delete(tableId: string, ownerId: string): Promise<void> {
    const key = `${TABLE_PREFIX}${tableId}`;
    await redisClient.del(key);
    await redisClient.sRem(TABLE_IDS_KEY, tableId);
    await redisClient.sRem(`${TABLE_BY_OWNER_PREFIX}${ownerId}`, tableId);
  }
}

export const tableStore = new TableStore();
