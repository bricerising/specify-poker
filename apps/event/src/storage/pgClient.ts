import { Pool } from "pg";
import { config } from "../config";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);

export const getClient = () => pool.connect();

let closePromise: Promise<void> | null = null;

export function closePgPool(): Promise<void> {
  if (closePromise) {
    return closePromise;
  }
  closePromise = pool.end();
  return closePromise;
}

export default pool;
