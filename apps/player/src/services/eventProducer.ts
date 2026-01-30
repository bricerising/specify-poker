import { randomUUID } from 'crypto';
import { getRedisClient } from '../storage/redisClient';
import logger from '../observability/logger';
import { asError } from '../domain/errors';

export async function publishEvent(type: string, payload: unknown, userId?: string): Promise<void> {
  let client: Awaited<ReturnType<typeof getRedisClient>>;
  try {
    client = await getRedisClient();
  } catch {
    client = null;
  }
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
  } catch (error: unknown) {
    logger.error({ err: asError(error), type }, 'eventProducer.publishEvent.failed');
  }
}
