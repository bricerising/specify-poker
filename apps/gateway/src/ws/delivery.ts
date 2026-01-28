import logger from '../observability/logger';
import { getSubscribers } from './subscriptions';
import { sendToLocalText } from './localRegistry';

export async function deliverToSubscribers(channel: string, message: unknown): Promise<void> {
  const connectionIds = await getSubscribers(channel);
  if (connectionIds.length === 0) {
    return;
  }

  let payloadText: string;
  try {
    payloadText = JSON.stringify(message);
  } catch (err) {
    logger.error({ err, channel }, 'ws.delivery.serialize.failed');
    return;
  }

  for (const connectionId of connectionIds) {
    sendToLocalText(connectionId, payloadText);
  }
}
