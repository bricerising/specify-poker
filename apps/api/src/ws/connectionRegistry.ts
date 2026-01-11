import { recordSessionEnd, recordSessionStart, recordWsReconnect, updateActiveConnections } from "../observability/metrics";
import { getRedisClient } from "../services/redisClient";

export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  connectedAt: string;
  handsPlayed?: number;
}

const CONNECTIONS_KEY = "poker:ws:connections";

export async function registerConnection(info: ConnectionInfo) {
  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(CONNECTIONS_KEY, info.connectionId, JSON.stringify(info));
  }
  updateActiveConnections(1);
  recordSessionStart();
}

export async function unregisterConnection(connectionId: string) {
  const redis = await getRedisClient();
  // Get connection info before deleting to record session metrics
  const connection = await getConnection(connectionId);
  if (redis) {
    await redis.hDel(CONNECTIONS_KEY, connectionId);
  }
  updateActiveConnections(-1);

  // Record session duration and hands played
  if (connection) {
    const connectedAt = new Date(connection.connectedAt).getTime();
    const durationSeconds = Math.max(0, (Date.now() - connectedAt) / 1000);
    recordSessionEnd(durationSeconds, connection.handsPlayed ?? 0);
  }
}

export async function getConnection(connectionId: string) {
  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }
  const payload = await redis.hGet(CONNECTIONS_KEY, connectionId);
  return payload ? (JSON.parse(payload) as ConnectionInfo) : null;
}

export async function getActiveConnections() {
  const redis = await getRedisClient();
  if (!redis) {
    return [];
  }
  const entries = await redis.hGetAll(CONNECTIONS_KEY);
  return Object.values(entries).map((value) => JSON.parse(value) as ConnectionInfo);
}

export async function resetConnections() {
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(CONNECTIONS_KEY);
  }
}

export async function incrementHandsPlayed(connectionId: string) {
  const connection = await getConnection(connectionId);
  if (connection) {
    connection.handsPlayed = (connection.handsPlayed ?? 0) + 1;
    const redis = await getRedisClient();
    if (redis) {
      await redis.hSet(CONNECTIONS_KEY, connectionId, JSON.stringify(connection));
    }
  }
}

export async function recordReconnection() {
  recordWsReconnect();
}
