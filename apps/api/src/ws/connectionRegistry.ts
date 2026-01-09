import { getRedisClient } from "../services/redisClient";

export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  connectedAt: string;
}

const connections = new Map<string, ConnectionInfo>();
const CONNECTIONS_KEY = "poker:ws:connections";

export async function registerConnection(info: ConnectionInfo) {
  connections.set(info.connectionId, info);
  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(CONNECTIONS_KEY, info.connectionId, JSON.stringify(info));
  }
}

export async function unregisterConnection(connectionId: string) {
  connections.delete(connectionId);
  const redis = await getRedisClient();
  if (redis) {
    await redis.hDel(CONNECTIONS_KEY, connectionId);
  }
}

export async function getActiveConnections() {
  const redis = await getRedisClient();
  if (!redis) {
    return Array.from(connections.values());
  }
  const entries = await redis.hGetAll(CONNECTIONS_KEY);
  const list = Object.values(entries).map((value) => JSON.parse(value) as ConnectionInfo);
  list.forEach((info) => connections.set(info.connectionId, info));
  return list;
}

export async function resetConnections() {
  connections.clear();
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(CONNECTIONS_KEY);
  }
}
