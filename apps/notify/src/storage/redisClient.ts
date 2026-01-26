import { createClient as createRedisClient, RedisClientType } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

export type RedisClientManager = {
  getClient(): Promise<RedisClientType>;
  getBlockingClient(): Promise<RedisClientType>;
  close(): Promise<void>;
};

type CreateRedisClientManagerOptions = {
  url: string;
  createClient?: typeof createRedisClient;
  log?: typeof logger;
};

export function createRedisClientManager(options: CreateRedisClientManagerOptions): RedisClientManager {
  const createClient = options.createClient ?? createRedisClient;
  const log = options.log ?? logger;

  let client: RedisClientType | null = null;
  let blockingClient: RedisClientType | null = null;

  const getClient = async (): Promise<RedisClientType> => {
    if (client) {
      return client;
    }

    client = createClient({ url: options.url });
    client.on("error", (err) => log.error({ err }, "Redis client error"));
    await client.connect();
    return client;
  };

  const getBlockingClient = async (): Promise<RedisClientType> => {
    if (blockingClient) {
      return blockingClient;
    }

    blockingClient = client ? client.duplicate() : createClient({ url: options.url });
    blockingClient.on("error", (err) => log.error({ err }, "Redis blocking client error"));
    await blockingClient.connect();
    return blockingClient;
  };

  const close = async (): Promise<void> => {
    if (blockingClient) {
      await blockingClient.quit();
      blockingClient = null;
    }

    if (client) {
      await client.quit();
      client = null;
    }
  };

  return { getClient, getBlockingClient, close };
}

let defaultManager: RedisClientManager | null = null;

function getDefaultManager(): RedisClientManager {
  if (!defaultManager) {
    defaultManager = createRedisClientManager({ url: getConfig().redisUrl });
  }

  return defaultManager;
}

export async function getRedisClient(): Promise<RedisClientType> {
  return getDefaultManager().getClient();
}

export async function getBlockingRedisClient(): Promise<RedisClientType> {
  return getDefaultManager().getBlockingClient();
}

export async function closeRedisClient(): Promise<void> {
  if (!defaultManager) {
    return;
  }

  await defaultManager.close();
  defaultManager = null;
}
