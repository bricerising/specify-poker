import { withRedisClient } from './redisClient';
import { safeJsonParseRecord } from '../utils/json';

export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  connectedAt: string;
  instanceId: string;
  ip: string;
}

const CONNECTIONS_KEY = 'gateway:connections';
const USER_CONNECTIONS_KEY = 'gateway:user_connections'; // Map userId to set of connectionIds

function readNonEmptyString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string') {
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

  const connectionId = readNonEmptyString(record, ['connectionId', 'connection_id']);
  const userId = readNonEmptyString(record, ['userId', 'user_id']);
  const connectedAt = readNonEmptyString(record, ['connectedAt', 'connected_at']);
  const instanceId = readNonEmptyString(record, ['instanceId', 'instance_id']);
  const ip = readNonEmptyString(record, ['ip']);

  if (!connectionId || !userId || !connectedAt || !instanceId || !ip) {
    return null;
  }

  return { connectionId, userId, connectedAt, instanceId, ip };
}

export async function saveConnection(info: ConnectionInfo) {
  await withRedisClient(
    async (redis) => {
      await redis.hSet(CONNECTIONS_KEY, info.connectionId, JSON.stringify(info));
      await redis.sAdd(`${USER_CONNECTIONS_KEY}:${info.userId}`, info.connectionId);
    },
    {
      fallback: undefined,
      logMessage: 'connection.save.failed',
      context: { connectionId: info.connectionId },
    },
  );
}

export async function deleteConnection(connectionId: string, userId: string) {
  await withRedisClient(
    async (redis) => {
      await redis.hDel(CONNECTIONS_KEY, connectionId);
      await redis.sRem(`${USER_CONNECTIONS_KEY}:${userId}`, connectionId);
    },
    {
      fallback: undefined,
      logMessage: 'connection.delete.failed',
      context: { connectionId, userId },
    },
  );
}

export async function getConnection(connectionId: string): Promise<ConnectionInfo | null> {
  return await withRedisClient(
    async (redis) => {
      const data = await redis.hGet(CONNECTIONS_KEY, connectionId);
      return data ? parseConnectionInfo(data) : null;
    },
    {
      fallback: null,
      logMessage: 'connection.get.failed',
      context: { connectionId },
    },
  );
}

export async function getConnectionsByUser(userId: string): Promise<string[]> {
  return await withRedisClient(
    async (redis) => redis.sMembers(`${USER_CONNECTIONS_KEY}:${userId}`),
    {
      fallback: [],
      logMessage: 'connection.listByUser.failed',
      context: { userId },
    },
  );
}

export async function clearInstanceConnections(instanceId: string) {
  await withRedisClient(
    async (redis) => {
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
    },
    {
      fallback: undefined,
      logMessage: 'connection.clearInstanceConnections.failed',
      context: { instanceId },
    },
  );
}
