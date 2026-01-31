import {
  createRedisStreamConsumerLifecycle,
} from '@specify-poker/shared/redis';
import type {
  RedisStreamConsumerClient,
  RedisStreamConsumerLifecycle,
  RedisStreamConsumerMessage,
} from '@specify-poker/shared/redis';

import { blockingRedisClient } from '../storage/redisClient';
import { eventStore } from '../storage/eventStore';
import { handStore } from '../storage/handStore';
import { streamKey } from '../storage/streamStore';
import { recordMaterializationLag } from '../observability/metrics';
import logger from '../observability/logger';
import { getErrorMessage, isRecord } from '../errors';
import { aggregateHandRecord } from './handMaterializerAggregation';
import { safeJsonParseRecord } from '../utils/json';

export interface HandMaterializerDependencies {
  redisClient: RedisStreamConsumerClient;
  eventStore: typeof eventStore;
  handStore: typeof handStore;
  recordMaterializationLag: typeof recordMaterializationLag;
}

export class HandMaterializer {
  private streamRedisKey = streamKey('all');
  private groupName = 'hand-materializer';
  private consumerName = `materializer-${process.pid}`;
  private readonly lifecycle: RedisStreamConsumerLifecycle;

  constructor(private readonly deps: HandMaterializerDependencies) {
    this.lifecycle = createRedisStreamConsumerLifecycle({
      streamKey: this.streamRedisKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      groupStartId: '$',
      readCount: 1,
      blockMs: 5000,
      getClient: async () => this.deps.redisClient,
      onMessage: async (message) => {
        await this.handleStreamMessage(message);
      },
      logger,
      isBusyGroupError: (error: unknown) => getErrorMessage(error).includes('BUSYGROUP'),
    });
  }

  async start(): Promise<void> {
    const wasRunning = this.lifecycle.isRunning();

    logger.info(
      { streamKey: this.streamRedisKey, group: this.groupName },
      'HandMaterializer starting',
    );

    await this.lifecycle.start();

    if (!wasRunning && this.lifecycle.isRunning()) {
      logger.info(
        { streamKey: this.streamRedisKey, group: this.groupName },
        'HandMaterializer started',
      );
    }
  }

  private async handleStreamMessage(message: RedisStreamConsumerMessage): Promise<void> {
    const rawData = message.fields.data;
    if (typeof rawData !== 'string') {
      logger.warn(
        { streamKey: this.streamRedisKey, group: this.groupName, messageId: message.id },
        'Invalid stream message (missing data)',
      );
      return;
    }

    const parsed = safeJsonParseRecord(rawData);
    if (!parsed) {
      logger.warn(
        { streamKey: this.streamRedisKey, group: this.groupName, messageId: message.id },
        'Invalid JSON in HandMaterializer stream message',
      );
      return;
    }

    await this.handleEvent(parsed);
  }

  async handleEvent(event: unknown): Promise<void> {
    if (!isRecord(event)) {
      return;
    }
    const handCompleted = parseHandCompletedEvent(event);
    if (!handCompleted) {
      return;
    }
    logger.info(
      { handId: handCompleted.handId, tableId: handCompleted.tableId },
      'Materializing hand record',
    );
    await this.materializeHand(handCompleted.handId, handCompleted.tableId);
  }

  private async materializeHand(handId: string, tableId: string) {
    try {
      // 1. Query all events for this hand
      const { events } = await this.deps.eventStore.queryEvents({ handId, limit: 1000 });

      if (events.length === 0) return;

      // 2. Aggregate events into a HandRecord
      const record = aggregateHandRecord(handId, tableId, events);

      // 3. Save HandRecord
      await this.deps.handStore.saveHandRecord(record);
      this.deps.recordMaterializationLag(Date.now() - record.completedAt.getTime());
      logger.info({ handId }, 'Hand record saved');
    } catch (err) {
      logger.error({ err, handId }, 'Failed to materialize hand');
    }
  }

  async stop(): Promise<void> {
    await this.lifecycle.stop();
  }
}

export function createHandMaterializer(
  deps: HandMaterializerDependencies = {
    redisClient: blockingRedisClient,
    eventStore,
    handStore,
    recordMaterializationLag,
  },
) {
  return new HandMaterializer(deps);
}

export const handMaterializer = createHandMaterializer();

type HandCompletedEvent = { type: 'HAND_COMPLETED'; handId: string; tableId: string };

function parseHandCompletedEvent(event: Record<string, unknown>): HandCompletedEvent | null {
  if (event.type !== 'HAND_COMPLETED') {
    return null;
  }
  const handId = event.handId;
  const tableId = event.tableId;
  if (typeof handId !== 'string' || handId.trim().length === 0) {
    return null;
  }
  if (typeof tableId !== 'string' || tableId.trim().length === 0) {
    return null;
  }
  return { type: 'HAND_COMPLETED', handId, tableId };
}
