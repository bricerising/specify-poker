import { getRedisClient } from "../storage/redisClient";
import logger from "../observability/logger";

const SUBSCRIPTIONS_KEY = "gateway:subscriptions"; // Map channel to set of connectionIds

export async function subscribeToChannel(connectionId: string, channel: string) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.sAdd(`${SUBSCRIPTIONS_KEY}:${channel}`, connectionId);
    await redis.sAdd(`conn_subs:${connectionId}`, channel);
  } catch (err) {
    logger.error({ err, connectionId, channel }, "Failed to subscribe to channel");
  }
}

export async function unsubscribeFromChannel(connectionId: string, channel: string) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.sRem(`${SUBSCRIPTIONS_KEY}:${channel}`, connectionId);
    await redis.sRem(`conn_subs:${connectionId}`, channel);
  } catch (err) {
    logger.error({ err, connectionId, channel }, "Failed to unsubscribe from channel");
  }
}

export async function unsubscribeAll(connectionId: string) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    const channels = await redis.sMembers(`conn_subs:${connectionId}`);
    for (const channel of channels) {
      await redis.sRem(`${SUBSCRIPTIONS_KEY}:${channel}`, connectionId);
    }
    await redis.del(`conn_subs:${connectionId}`);
  } catch (err) {
    logger.error({ err, connectionId }, "Failed to unsubscribe from all channels");
  }
}

export async function getSubscribers(channel: string): Promise<string[]> {
  const redis = await getRedisClient();
  if (!redis) return [];

  try {
    return await redis.sMembers(`${SUBSCRIPTIONS_KEY}:${channel}`);
  } catch (err) {
    logger.error({ err, channel }, "Failed to get subscribers for channel");
    return [];
  }
}
