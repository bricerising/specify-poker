import { getRedisClient } from "./redisClient";
import logger from "../observability/logger";

export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  connectedAt: string;
  instanceId: string;
  ip: string;
}

const CONNECTIONS_KEY = "gateway:connections";
const USER_CONNECTIONS_KEY = "gateway:user_connections"; // Map userId to set of connectionIds

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
    return data ? JSON.parse(data) : null;
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
      const info = JSON.parse(data) as ConnectionInfo;
      if (info.instanceId === instanceId) {
        await deleteConnection(connectionId, info.userId);
      }
    }
  } catch (err) {
    logger.error({ err, instanceId }, "Failed to clear instance connections");
  }
}
