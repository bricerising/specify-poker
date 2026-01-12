import { Pool } from "pg";
import { config } from "../config";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);

export const getClient = () => pool.connect();

export default pool;
