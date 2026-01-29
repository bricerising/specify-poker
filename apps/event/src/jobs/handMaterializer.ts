import {
  runRedisStreamConsumer,
  type RedisStreamConsumerClient,
  type RedisStreamConsumerMessage,
} from '@specify-poker/shared/redis';

import { blockingRedisClient } from '../storage/redisClient';
import { eventStore } from '../storage/eventStore';
import { handStore } from '../storage/handStore';
import { streamKey } from '../storage/streamStore';
import { recordMaterializationLag } from '../observability/metrics';
import logger from '../observability/logger';
import { getErrorMessage, isRecord } from '../errors';
import { aggregateHandRecord } from './handMaterializerAggregation';

export interface HandMaterializerDependencies {
  redisClient: RedisStreamConsumerClient;
  eventStore: typeof eventStore;
  handStore: typeof handStore;
  recordMaterializationLag: typeof recordMaterializationLag;
}

export class HandMaterializer {
  constructor(private readonly deps: HandMaterializerDependencies) {}

  private isRunning = false;
  private streamRedisKey = streamKey('all');
  private groupName = 'hand-materializer';
  private consumerName = `materializer-${process.pid}`;
  private pollPromise: Promise<void> | null = null;
  private abortController: AbortController | null = null;

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    logger.info(
      { streamKey: this.streamRedisKey, group: this.groupName },
      'HandMaterializer starting',
    );

    const controller = new AbortController();
    this.abortController = controller;

    this.pollPromise = runRedisStreamConsumer(controller.signal, {
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
    }).catch((error: unknown) => {
      if (!this.isRunning || controller.signal.aborted) {
        return;
      }
      logger.error({ err: error }, 'HandMaterializer poll loop crashed');
    });

    logger.info(
      { streamKey: this.streamRedisKey, group: this.groupName },
      'HandMaterializer started',
    );
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

    const parsed = safeJsonParse(rawData);
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
      logger.error({ error: err, handId }, 'Failed to materialize hand');
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.abortController?.abort();
    this.abortController = null;

    const pollPromise = this.pollPromise;
    this.pollPromise = null;
    await pollPromise?.catch(() => undefined);
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

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
