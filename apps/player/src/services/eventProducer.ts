import { randomUUID } from 'crypto';
import { getRedisClient } from '../storage/redisClient';
import logger from '../observability/logger';

export async function publishEvent(type: string, payload: unknown, userId?: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    logger.warn({ type }, 'Redis not available, cannot publish event');
    return;
  }

  const event = {
    event_id: randomUUID(),
    type,
    user_id: userId,
    payload,
    timestamp: new Date().toISOString(),
  };

  try {
    await client.xAdd('events:all', '*', {
      data: JSON.stringify(event),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'unknown';
    logger.error({ type, error: errorMessage }, 'Failed to publish event to Redis');
  }
}
