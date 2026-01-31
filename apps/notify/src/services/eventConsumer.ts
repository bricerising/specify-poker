import logger from '../observability/logger';
import { getErrorMessage, toError } from '../shared/errors';
import { createRedisStreamConsumerLifecycle } from '@specify-poker/shared/redis';
import { dispatchByTypeNoCtx } from '@specify-poker/shared/pipeline';
import type {
  RedisStreamConsumerClient,
  RedisStreamConsumerLifecycle,
  RedisStreamConsumerOptions,
} from '@specify-poker/shared/redis';
import type { GameEventHandlers } from './gameEventHandlers';
import { decodeGameEvent, type GameEvent, type GameEventDecodeResult } from './gameEvents';

type EventConsumerOptions = {
  streamKey: string;
  groupName?: string;
  consumerName?: string;
  getRedisClient: () => Promise<RedisStreamConsumerClient>;
  blockMs?: number;
  readCount?: number;
  sleep?: (ms: number) => Promise<void>;
  runConsumer?: (signal: AbortSignal, options: RedisStreamConsumerOptions) => Promise<void>;
};

export class EventConsumer {
  private readonly streamKey: string;
  private readonly groupName: string;
  private readonly consumerName: string;
  private readonly getClient: () => Promise<RedisStreamConsumerClient>;
  private readonly blockMs: number;
  private readonly readCount: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly eventHandlers: GameEventHandlers;
  private readonly lifecycle: RedisStreamConsumerLifecycle;

  constructor(handlers: GameEventHandlers, options: EventConsumerOptions) {
    this.streamKey = options.streamKey;
    this.groupName = options.groupName ?? 'notify-service';
    this.consumerName = options.consumerName ?? `consumer-${process.pid}`;
    this.getClient = options.getRedisClient;
    this.blockMs = options.blockMs ?? 5000;
    this.readCount = options.readCount ?? 1;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.eventHandlers = handlers;

    this.lifecycle = createRedisStreamConsumerLifecycle({
      streamKey: this.streamKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      getClient: this.getClient,
      onMessage: async ({ id, fields }) => {
        await this.handleMessage(fields, id);
      },
      blockMs: this.blockMs,
      readCount: this.readCount,
      sleep: this.sleep,
      runConsumer: options.runConsumer,
      logger,
      isBusyGroupError: (error: unknown) => getErrorMessage(error).includes('BUSYGROUP'),
    });
  }

  async start(): Promise<void> {
    if (!this.lifecycle.isRunning()) {
      logger.info({ streamKey: this.streamKey }, 'EventConsumer starting');
    }
    await this.lifecycle.start();
  }

  async handleMessage(message: unknown, messageId?: string): Promise<void> {
    const decoded = decodeGameEvent(message);
    if (!decoded.ok) {
      this.logDecodeFailure(decoded, messageId);
      return;
    }

    try {
      await this.dispatch(decoded.value);
    } catch (error: unknown) {
      logger.error(
        {
          err: toError(error),
          type: decoded.value.type,
          userId: decoded.value.userId,
          messageId,
        },
        'Error handling game event',
      );
    }
  }

  private logDecodeFailure(
    result: Extract<GameEventDecodeResult, { ok: false }>,
    messageId?: string,
  ): void {
    if (result.error.type === 'UnknownType') {
      logger.debug({ type: result.error.eventType, messageId }, 'Ignoring unknown game event');
      return;
    }

    logger.debug({ messageId }, 'Ignoring invalid game event message');
  }

  private async dispatch(event: GameEvent): Promise<void> {
    await dispatchByTypeNoCtx(this.eventHandlers, event);
  }

  async stop(): Promise<void> {
    await this.lifecycle.stop();
  }

  isRunning(): boolean {
    return this.lifecycle.isRunning();
  }
}
