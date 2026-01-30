import { getRedisClient } from './redisClient';
import { getWsInstanceId } from '../ws/pubsub';
import { clearInstanceConnections } from './connectionStore';
import logger from '../observability/logger';

const INSTANCE_REGISTRY_KEY = 'gateway:instances';
const HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_THRESHOLD_MS = 30_000;

type RedisClient = NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;

type InstanceRegistryDeps = {
  readonly getRedisClient: typeof getRedisClient;
  readonly getInstanceId: () => string;
  readonly clearInstanceConnections: typeof clearInstanceConnections;
  readonly logger: Pick<typeof logger, 'info' | 'error'>;
  readonly now: () => number;
  readonly heartbeatIntervalMs: number;
  readonly staleThresholdMs: number;
};

async function updateHeartbeat(
  redis: RedisClient,
  instanceId: string,
  now: () => number,
  log: Pick<typeof logger, 'error'>,
): Promise<void> {
  try {
    await redis.hSet(INSTANCE_REGISTRY_KEY, instanceId, now().toString());
  } catch (err) {
    log.error({ err, instanceId }, 'Failed to update instance heartbeat');
  }
}

export type InstanceRegistry = {
  register(): Promise<void>;
  unregister(): Promise<void>;
  cleanupStaleInstances(): Promise<void>;
};

export function createInstanceRegistry(
  overrides: Partial<InstanceRegistryDeps> = {},
): InstanceRegistry {
  const deps: InstanceRegistryDeps = {
    getRedisClient: overrides.getRedisClient ?? getRedisClient,
    getInstanceId: overrides.getInstanceId ?? getWsInstanceId,
    clearInstanceConnections: overrides.clearInstanceConnections ?? clearInstanceConnections,
    logger: overrides.logger ?? logger,
    now: overrides.now ?? (() => Date.now()),
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS,
    staleThresholdMs: overrides.staleThresholdMs ?? STALE_THRESHOLD_MS,
  };

  let heartbeatIntervalId: NodeJS.Timeout | null = null;
  let registeredInstanceId: string | null = null;

  const clearHeartbeat = () => {
    if (!heartbeatIntervalId) {
      return;
    }
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  };

  const cleanupStaleInstances = async (): Promise<void> => {
    const redis = await deps.getRedisClient();
    if (!redis) {
      return;
    }

    try {
      const instances = await redis.hGetAll(INSTANCE_REGISTRY_KEY);
      const now = deps.now();

      for (const [instanceId, lastSeen] of Object.entries(instances)) {
        const lastSeenMs = Number.parseInt(lastSeen, 10);
        if (!Number.isFinite(lastSeenMs)) {
          continue;
        }
        if (now - lastSeenMs <= deps.staleThresholdMs) {
          continue;
        }

        deps.logger.info({ staleInstanceId: instanceId }, 'Cleaning up stale instance');
        await deps.clearInstanceConnections(instanceId);
        await redis.hDel(INSTANCE_REGISTRY_KEY, instanceId);
      }
    } catch (err) {
      deps.logger.error({ err }, 'Failed to cleanup stale instances');
    }
  };

  const register = async (): Promise<void> => {
    clearHeartbeat();
    registeredInstanceId = null;

    const redis = await deps.getRedisClient();
    if (!redis) {
      return;
    }

    const instanceId = deps.getInstanceId();
    const now = deps.now();

    try {
      await redis.hSet(INSTANCE_REGISTRY_KEY, instanceId, now.toString());

      registeredInstanceId = instanceId;

      // Heartbeat
      heartbeatIntervalId = setInterval(() => {
        void updateHeartbeat(redis, instanceId, deps.now, deps.logger);
      }, deps.heartbeatIntervalMs);

      // Initial cleanup of other stale instances.
      await cleanupStaleInstances();
    } catch (err) {
      deps.logger.error({ err, instanceId }, 'Failed to register instance');
    }
  };

  const unregister = async (): Promise<void> => {
    clearHeartbeat();

    const instanceId = registeredInstanceId;
    registeredInstanceId = null;
    if (!instanceId) {
      return;
    }

    const redis = await deps.getRedisClient();
    if (!redis) {
      return;
    }

    try {
      await deps.clearInstanceConnections(instanceId);
      await redis.hDel(INSTANCE_REGISTRY_KEY, instanceId);
    } catch (err) {
      deps.logger.error({ err, instanceId }, 'Failed to unregister instance');
    }
  };

  return { register, unregister, cleanupStaleInstances };
}

const defaultRegistry = createInstanceRegistry();

export async function registerInstance(): Promise<void> {
  await defaultRegistry.register();
}

export async function unregisterInstance(): Promise<void> {
  await defaultRegistry.unregister();
}

export async function cleanupStaleInstances(): Promise<void> {
  await defaultRegistry.cleanupStaleInstances();
}
