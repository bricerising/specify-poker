import { getRedisClient } from "./redisClient";
import { getWsInstanceId } from "../ws/pubsub";
import { clearInstanceConnections } from "./connectionStore";
import logger from "../observability/logger";

const INSTANCE_REGISTRY_KEY = "gateway:instances";
const HEARTBEAT_INTERVAL = 10000;
const STALE_THRESHOLD = 30000;

export async function registerInstance() {
  const redis = await getRedisClient();
  if (!redis) return;

  const instanceId = getWsInstanceId();
  const now = Date.now();

  try {
    await redis.hSet(INSTANCE_REGISTRY_KEY, instanceId, now.toString());

    // Start heartbeat
    setInterval(async () => {
      try {
        await redis.hSet(INSTANCE_REGISTRY_KEY, instanceId, Date.now().toString());
      } catch (err) {
        logger.error({ err }, "Failed to update instance heartbeat");
      }
    }, HEARTBEAT_INTERVAL);

    // Initial cleanup of other stale instances
    await cleanupStaleInstances();
  } catch (err) {
    logger.error({ err }, "Failed to register instance");
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
