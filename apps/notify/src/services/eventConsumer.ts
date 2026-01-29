import { getBlockingRedisClient } from '../storage/redisClient';
import logger from '../observability/logger';
import { getConfig } from '../config';
import { getErrorMessage } from '../shared/errors';
import { dispatchByTypeNoCtx } from '@specify-poker/shared/pipeline';
import {
  runRedisStreamConsumer,
  type RedisStreamConsumerClient,
} from '@specify-poker/shared/redis';
import {
  createGameEventHandlers,
  decodeGameEvent,
  type GameEvent,
  type GameEventDecodeResult,
  type GameEventHandlers,
  type PushSender,
} from './gameEventHandlers';

type EventConsumerOptions = {
  streamKey?: string;
  groupName?: string;
  consumerName?: string;
  getRedisClient?: () => Promise<RedisStreamConsumerClient>;
  blockMs?: number;
  readCount?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class EventConsumer {
  private readonly pushSender: PushSender;
  private isRunning: boolean = false;
  private readonly streamKey: string;
  private readonly groupName: string;
  private readonly consumerName: string;
  private readonly getClient: () => Promise<RedisStreamConsumerClient>;
  private readonly blockMs: number;
  private readonly readCount: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private pollPromise: Promise<void> | null = null;
  private readonly handlers: GameEventHandlers;
  private abortController: AbortController | null = null;

  constructor(pushSender: PushSender, options: EventConsumerOptions = {}) {
    this.pushSender = pushSender;
    this.streamKey = options.streamKey ?? getConfig().eventStreamKey;
    this.groupName = options.groupName ?? 'notify-service';
    this.consumerName = options.consumerName ?? `consumer-${process.pid}`;
    this.getClient = options.getRedisClient ?? getBlockingRedisClient;
    this.blockMs = options.blockMs ?? 5000;
    this.readCount = options.readCount ?? 1;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.handlers = createGameEventHandlers(this.pushSender);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    logger.info({ streamKey: this.streamKey }, 'EventConsumer starting');

    const controller = new AbortController();
    this.abortController = controller;

    this.pollPromise = runRedisStreamConsumer(controller.signal, {
      streamKey: this.streamKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      getClient: this.getClient,
      onMessage: async ({ fields }) => {
        await this.handleEvent(fields);
      },
      blockMs: this.blockMs,
      readCount: this.readCount,
      sleep: this.sleep,
      logger,
      isBusyGroupError: (error: unknown) => getErrorMessage(error).includes('BUSYGROUP'),
    }).catch((error: unknown) => {
      logger.error({ err: error }, 'EventConsumer poll loop crashed');
    });
  }

  private async handleEvent(message: unknown): Promise<void> {
    try {
      const decoded = decodeGameEvent(message);
      if (!decoded.ok) {
        this.logDecodeFailure(decoded);
        return;
      }

      await this.dispatch(decoded.event);
    } catch (err) {
      logger.error({ err }, 'Error handling event');
    }
  }

  private logDecodeFailure(result: Extract<GameEventDecodeResult, { ok: false }>): void {
    if (result.reason !== 'UnknownType') {
      return;
    }

    logger.debug({ type: result.type }, 'Ignoring unknown game event');
  }

  private async dispatch(event: GameEvent): Promise<void> {
    await dispatchByTypeNoCtx(this.handlers, event);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.abortController?.abort();
    if (this.pollPromise) {
      await this.pollPromise;
      this.pollPromise = null;
    }
    this.abortController = null;
  }
}
