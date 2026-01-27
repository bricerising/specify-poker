import { getRedisClient } from "./redisClient";
import { getWsInstanceId } from "../ws/pubsub";
import { clearInstanceConnections } from "./connectionStore";
import logger from "../observability/logger";

const INSTANCE_REGISTRY_KEY = "gateway:instances";
const HEARTBEAT_INTERVAL = 10000;
const STALE_THRESHOLD = 30000;

let heartbeatIntervalId: NodeJS.Timeout | null = null;
let registeredInstanceId: string | null = null;

async function updateHeartbeat(
  redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
  instanceId: string,
): Promise<void> {
  try {
    await redis.hSet(INSTANCE_REGISTRY_KEY, instanceId, Date.now().toString());
  } catch (err) {
    logger.error({ err }, "Failed to update instance heartbeat");
  }
}

export async function registerInstance() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  registeredInstanceId = null;

  const redis = await getRedisClient();
  if (!redis) return;

  const instanceId = getWsInstanceId();
  const now = Date.now();

  try {
    await redis.hSet(INSTANCE_REGISTRY_KEY, instanceId, now.toString());

    registeredInstanceId = instanceId;
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
    }

    // Start heartbeat
    heartbeatIntervalId = setInterval(() => {
      void updateHeartbeat(redis, instanceId);
    }, HEARTBEAT_INTERVAL);

    // Initial cleanup of other stale instances
    await cleanupStaleInstances();
  } catch (err) {
    logger.error({ err }, "Failed to register instance");
  }
}

export async function unregisterInstance(): Promise<void> {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }

  const instanceId = registeredInstanceId;
  registeredInstanceId = null;
  if (!instanceId) {
    return;
  }

  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await clearInstanceConnections(instanceId);
    await redis.hDel(INSTANCE_REGISTRY_KEY, instanceId);
  } catch (err) {
    logger.error({ err, instanceId }, "Failed to unregister instance");
  }
}

export async function cleanupStaleInstances() {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    const instances = await redis.hGetAll(INSTANCE_REGISTRY_KEY);
    const now = Date.now();

    for (const [instanceId, lastSeen] of Object.entries(instances)) {
      if (now - parseInt(lastSeen, 10) > STALE_THRESHOLD) {
        logger.info({ staleInstanceId: instanceId }, "Cleaning up stale instance");
        await clearInstanceConnections(instanceId);
        await redis.hDel(INSTANCE_REGISTRY_KEY, instanceId);
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to cleanup stale instances");
  }
}
