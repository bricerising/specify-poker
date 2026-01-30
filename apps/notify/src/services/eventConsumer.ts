import logger from '../observability/logger';
import { getErrorMessage, toError } from '../shared/errors';
import {
  createAsyncLifecycle,
  exponentialBackoff,
  type AsyncLifecycle,
  type RetryStrategy,
} from '@specify-poker/shared';
import { dispatchByTypeNoCtx } from '@specify-poker/shared/pipeline';
import {
  runRedisStreamConsumer,
  type RedisStreamConsumerClient,
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
  runConsumer?: typeof runRedisStreamConsumer;
};

export class EventConsumer {
  private readonly streamKey: string;
  private readonly groupName: string;
  private readonly consumerName: string;
  private readonly getClient: () => Promise<RedisStreamConsumerClient>;
  private readonly blockMs: number;
  private readonly readCount: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly runConsumer: typeof runRedisStreamConsumer;
  private pollPromise: Promise<void> | null = null;
  private readonly eventHandlers: GameEventHandlers;
  private abortController: AbortController | null = null;
  private readonly lifecycle: AsyncLifecycle;

  constructor(handlers: GameEventHandlers, options: EventConsumerOptions) {
    this.streamKey = options.streamKey;
    this.groupName = options.groupName ?? 'notify-service';
    this.consumerName = options.consumerName ?? `consumer-${process.pid}`;
    this.getClient = options.getRedisClient;
    this.blockMs = options.blockMs ?? 5000;
    this.readCount = options.readCount ?? 1;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.runConsumer = options.runConsumer ?? runRedisStreamConsumer;
    this.eventHandlers = handlers;
    this.lifecycle = createAsyncLifecycle({
      start: () => this.startInternal(),
      stop: () => this.stopInternal(),
    });
  }

  async start(): Promise<void> {
    await this.lifecycle.start();
  }

  private async startInternal(): Promise<void> {
    logger.info({ streamKey: this.streamKey }, 'EventConsumer starting');

    const controller = new AbortController();
    this.abortController = controller;

    this.pollPromise = this.runPollLoop(controller.signal);
  }

  private async runPollLoop(signal: AbortSignal): Promise<void> {
    const retryStrategy: RetryStrategy = exponentialBackoff({
      baseMs: 1000,
      maxMs: 30_000,
    });
    let attempt = 0;

    while (!signal.aborted) {
      try {
        await this.runConsumer(signal, {
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
          logger,
          isBusyGroupError: (error: unknown) => getErrorMessage(error).includes('BUSYGROUP'),
        });

        if (signal.aborted) {
          return;
        }

        attempt = 0;
        logger.warn(
          { streamKey: this.streamKey },
          'EventConsumer stream consumer exited unexpectedly; restarting',
        );
        await this.sleep(1000);
        continue;
      } catch (error: unknown) {
        if (signal.aborted) {
          return;
        }

        attempt += 1;
        const delayMs = retryStrategy.getDelayMs(attempt);

        logger.error(
          { err: toError(error), attempt, delayMs, streamKey: this.streamKey },
          'EventConsumer poll loop crashed; restarting',
        );
        await this.sleep(delayMs);
      }
    }
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

  private async stopInternal(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    if (this.pollPromise) {
      await this.pollPromise;
      this.pollPromise = null;
    }
  }

  isRunning(): boolean {
    return this.lifecycle.isRunning();
  }
}
