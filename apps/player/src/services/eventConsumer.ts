import {
  createRedisClientManager,
  runRedisStreamConsumer,
  type RedisStreamConsumerClient,
  type RedisStreamConsumerMessage,
} from "@specify-poker/shared/redis";
import { incrementHandsPlayed, incrementWins } from "./statisticsService";
import logger from "../observability/logger";
import { decodeStructLike } from "@specify-poker/shared";
import { getConfig } from "../config";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

type StatisticsService = {
  incrementHandsPlayed(userId: string): Promise<unknown>;
  incrementWins(userId: string): Promise<unknown>;
};

type HandEventType = "HAND_STARTED" | "HAND_ENDED";

type HandEventHandlers = {
  [Type in HandEventType]: (data: Record<string, unknown>) => Promise<void>;
};

export function createHandEventHandlers(statisticsService: StatisticsService): HandEventHandlers {
  return {
    HAND_STARTED: async (data) => {
      const participants = Array.isArray(data.participants) ? data.participants : [];
      for (const userId of participants) {
        if (typeof userId === "string" && userId) {
          await statisticsService.incrementHandsPlayed(userId);
        }
      }
    },
    HAND_ENDED: async (data) => {
      const winnerUserIds = Array.isArray(data.winnerUserIds) ? data.winnerUserIds : [];
      for (const userId of winnerUserIds) {
        if (typeof userId === "string" && userId) {
          await statisticsService.incrementWins(userId);
        }
      }
    },
  };
}

type SleepFn = (ms: number) => Promise<void>;

type EventConsumerOptions = {
  streamKey?: string;
  groupName?: string;
  consumerName?: string;
  getRedisClient?: () => Promise<RedisStreamConsumerClient | null>;
  closeRedisClient?: () => Promise<void>;
  blockMs?: number;
  readCount?: number;
  sleep?: SleepFn;
  statistics?: StatisticsService;
  redisUrl?: string | null;
};

export class EventConsumer {
  private isRunning: boolean = false;
  private readonly streamKey: string;
  private readonly groupName: string;
  private readonly consumerName: string;
  private readonly getClient: () => Promise<RedisStreamConsumerClient | null>;
  private readonly closeClient: () => Promise<void>;
  private readonly blockMs: number;
  private readonly readCount: number;
  private readonly sleep: SleepFn;
  private pollPromise: Promise<void> | null = null;
  private readonly handlers: HandEventHandlers;
  private abortController: AbortController | null = null;

  constructor(options: EventConsumerOptions = {}) {
    this.streamKey = options.streamKey ?? "events:all";
    this.groupName = options.groupName ?? "player-service";
    this.consumerName = options.consumerName ?? `consumer-${process.pid}`;
    this.blockMs = options.blockMs ?? 5000;
    this.readCount = options.readCount ?? 10;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    const statistics = options.statistics ?? { incrementHandsPlayed, incrementWins };
    this.handlers = createHandEventHandlers(statistics);

    if (options.getRedisClient) {
      this.getClient = options.getRedisClient;
      this.closeClient = options.closeRedisClient ?? (async () => undefined);
      return;
    }

    const url = options.redisUrl ?? getConfig().redisUrl;
    let manager: ReturnType<typeof createRedisClientManager> | null = null;

    const getManager = () => {
      if (!manager) {
        manager = createRedisClientManager({ url, log: logger, name: "player-event-consumer" });
      }
      return manager;
    };

    this.getClient = async () => {
      return (await getManager().getBlockingClientOrNull()) as unknown as RedisStreamConsumerClient | null;
    };

    this.closeClient = async () => {
      if (!manager) {
        return;
      }
      await manager.close();
      manager = null;
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const client = await this.getClient();
    if (!client) {
      logger.warn("Redis not available, EventConsumer will not start");
      return;
    }

    this.isRunning = true;
    logger.info("Player EventConsumer started");

    const controller = new AbortController();
    this.abortController = controller;

    this.pollPromise = runRedisStreamConsumer(controller.signal, {
      streamKey: this.streamKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      getClient: async () => {
        const nextClient = await this.getClient();
        if (!nextClient) {
          throw new Error("player_event_consumer.redis_not_available");
        }
        return nextClient;
      },
      onMessage: async (message) => {
        await this.handleStreamMessage(message);
      },
      blockMs: this.blockMs,
      readCount: this.readCount,
      sleep: this.sleep,
      logger,
    }).catch((error: unknown) => {
      if (!this.isRunning) {
        return;
      }
      logger.error({ err: error }, "EventConsumer poll loop crashed");
    });
  }

  private async handleStreamMessage(message: RedisStreamConsumerMessage): Promise<void> {
    const rawData = message.fields.data;
    if (typeof rawData !== "string") {
      logger.warn({ messageId: message.id }, "eventConsumer.invalidMessage");
      return;
    }

    const parsed = safeJsonParse(rawData);
    if (!parsed) {
      logger.warn({ messageId: message.id }, "eventConsumer.invalidJson");
      return;
    }

    await this.handleEvent(parsed);
  }

  async handleEvent(event: unknown): Promise<void> {
    try {
      if (!isRecord(event)) {
        return;
      }

      const type = event.type;
      if (type !== "HAND_STARTED" && type !== "HAND_ENDED") {
        return;
      }

      const data = decodeStructLike(event.payload);
      await this.handlers[type](data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      logger.error({ message }, "Error handling event");
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.abortController?.abort();
    await this.closeClient();
    if (this.pollPromise) {
      await this.pollPromise.catch(() => undefined);
      this.pollPromise = null;
    }
    this.abortController = null;
  }
}
