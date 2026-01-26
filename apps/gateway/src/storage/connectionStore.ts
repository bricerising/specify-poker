import { getRedisClient } from "./redisClient";
import logger from "../observability/logger";
import { safeJsonParseRecord } from "../utils/json";

export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  connectedAt: string;
  instanceId: string;
  ip: string;
}

const CONNECTIONS_KEY = "gateway:connections";
const USER_CONNECTIONS_KEY = "gateway:user_connections"; // Map userId to set of connectionIds

function readNonEmptyString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function parseConnectionInfo(raw: string): ConnectionInfo | null {
  const record = safeJsonParseRecord(raw);
  if (!record) {
    return null;
  }

  const connectionId = readNonEmptyString(record, ["connectionId", "connection_id"]);
  const userId = readNonEmptyString(record, ["userId", "user_id"]);
  const connectedAt = readNonEmptyString(record, ["connectedAt", "connected_at"]);
  const instanceId = readNonEmptyString(record, ["instanceId", "instance_id"]);
  const ip = readNonEmptyString(record, ["ip"]);

  if (!connectionId || !userId || !connectedAt || !instanceId || !ip) {
    return null;
  }

  return { connectionId, userId, connectedAt, instanceId, ip };
}

export async function saveConnection(info: ConnectionInfo) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.hSet(CONNECTIONS_KEY, info.connectionId, JSON.stringify(info));
    await redis.sAdd(`${USER_CONNECTIONS_KEY}:${info.userId}`, info.connectionId);
  } catch (err) {
    logger.error({ err, connectionId: info.connectionId }, "Failed to save connection to Redis");
  }
}

export async function deleteConnection(connectionId: string, userId: string) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.hDel(CONNECTIONS_KEY, connectionId);
    await redis.sRem(`${USER_CONNECTIONS_KEY}:${userId}`, connectionId);
  } catch (err) {
    logger.error({ err, connectionId }, "Failed to delete connection from Redis");
  }
}

export async function getConnection(connectionId: string): Promise<ConnectionInfo | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const data = await redis.hGet(CONNECTIONS_KEY, connectionId);
    return data ? parseConnectionInfo(data) : null;
  } catch (err) {
    logger.error({ err, connectionId }, "Failed to get connection from Redis");
    return null;
  }
}

export async function getConnectionsByUser(userId: string): Promise<string[]> {
  const redis = await getRedisClient();
  if (!redis) return [];

  try {
    return await redis.sMembers(`${USER_CONNECTIONS_KEY}:${userId}`);
  } catch (err) {
    logger.error({ err, userId }, "Failed to get user connections from Redis");
    return [];
  }
}

export async function clearInstanceConnections(instanceId: string) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    const all = await redis.hGetAll(CONNECTIONS_KEY);
    for (const [connectionId, data] of Object.entries(all)) {
      const info = parseConnectionInfo(data);
      if (!info) {
        continue;
      }
      if (info.instanceId === instanceId) {
        await deleteConnection(connectionId, info.userId);
      }
    }
  } catch (err) {
    logger.error({ err, instanceId }, "Failed to clear instance connections");
  }
}
