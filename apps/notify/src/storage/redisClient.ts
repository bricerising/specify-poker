import { createRedisClientManager as createSharedRedisClientManager } from "@specify-poker/shared/redis";
import type { RedisClientLogger, RedisClientManager as SharedRedisClientManager } from "@specify-poker/shared/redis";
import type { RedisClientType } from "redis";
import { getConfig } from "../config";
import logger from "../observability/logger";

export type RedisClientManager = Pick<SharedRedisClientManager, "getClient" | "getBlockingClient" | "close">;

type CreateRedisClientManagerOptions = {
  url: string;
  createClient?: Parameters<typeof createSharedRedisClientManager>[0]["createClient"];
  log?: RedisClientLogger;
};

export function createRedisClientManager(options: CreateRedisClientManagerOptions): RedisClientManager {
  return createSharedRedisClientManager({
    url: options.url,
    createClient: options.createClient,
    log: options.log ?? logger,
    name: "notify",
  });
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
