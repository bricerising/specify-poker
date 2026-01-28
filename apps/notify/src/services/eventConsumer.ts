import type { RedisClientType } from "redis";
import { getBlockingRedisClient } from "../storage/redisClient";
import logger from "../observability/logger";
import { getConfig } from "../config";
import { getErrorMessage } from "../shared/errors";
import {
  createGameEventHandlers,
  decodeGameEvent,
  type GameEvent,
  type GameEventDecodeResult,
  type GameEventHandlers,
  type PushSender,
} from "./gameEventHandlers";

type RedisStreamClient = Pick<RedisClientType, "xGroupCreate" | "xReadGroup" | "xAck">;

type EventConsumerOptions = {
  streamKey?: string;
  groupName?: string;
  consumerName?: string;
  getRedisClient?: () => Promise<RedisStreamClient>;
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
  private readonly getClient: () => Promise<RedisStreamClient>;
  private readonly blockMs: number;
  private readonly readCount: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private pollPromise: Promise<void> | null = null;
  private readonly handlers: GameEventHandlers;

  constructor(pushSender: PushSender, options: EventConsumerOptions = {}) {
    this.pushSender = pushSender;
    this.streamKey = options.streamKey ?? getConfig().eventStreamKey;
    this.groupName = options.groupName ?? "notify-service";
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
    logger.info({ streamKey: this.streamKey }, "EventConsumer starting");

    this.pollPromise = this.poll().catch((error: unknown) => {
      logger.error({ err: error }, "EventConsumer poll loop crashed");
    });
  }

  private async poll(): Promise<void> {
    while (this.isRunning) {
      try {
        const client = await this.getClient();

        try {
          await client.xGroupCreate(this.streamKey, this.groupName, "0", { MKSTREAM: true });
        } catch (error: unknown) {
          const message = getErrorMessage(error);
          if (!message.includes("BUSYGROUP")) {
            logger.warn({ err: error }, "Error creating consumer group; retrying");
            await this.sleep(1000);
            continue;
          }
        }

        const streams = await client.xReadGroup(
          this.groupName,
          this.consumerName,
          [{ key: this.streamKey, id: ">" }],
          { COUNT: this.readCount, BLOCK: this.blockMs }
        );

        if (!streams) {
          continue;
        }

        for (const stream of streams) {
          for (const message of stream.messages) {
            await this.handleEvent(message.message);
            await client.xAck(this.streamKey, this.groupName, message.id);
          }
        }
      } catch (err) {
        logger.warn({ err }, "Error polling events; retrying");
        await this.sleep(1000);
      }
    }
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
      logger.error({ err }, "Error handling event");
    }
  }

  private logDecodeFailure(result: Extract<GameEventDecodeResult, { ok: false }>): void {
    if (result.reason !== "UnknownType") {
      return;
    }

    logger.debug({ type: result.type }, "Ignoring unknown game event");
  }

  private async dispatch(event: GameEvent): Promise<void> {
    const handler = this.handlers[event.type];
    await handler(event as never);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollPromise) {
      await this.pollPromise;
      this.pollPromise = null;
    }
  }
}
