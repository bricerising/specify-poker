import { createRedisClientManager } from "@specify-poker/shared/redis";
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

type RedisStreamClient = {
  xGroupCreate: (streamKey: string, groupName: string, id: string, options: { MKSTREAM: boolean }) => Promise<unknown>;
  xReadGroup: (
    groupName: string,
    consumerName: string,
    streams: Array<{ key: string; id: string }>,
    options: { COUNT: number; BLOCK: number },
  ) => Promise<Array<{ messages: Array<{ id: string; message: Record<string, unknown> }> }> | null>;
  xAck: (streamKey: string, groupName: string, messageId: string) => Promise<unknown>;
};

type SleepFn = (ms: number) => Promise<void>;

type EventConsumerOptions = {
  streamKey?: string;
  groupName?: string;
  consumerName?: string;
  getRedisClient?: () => Promise<RedisStreamClient | null>;
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
  private readonly getClient: () => Promise<RedisStreamClient | null>;
  private readonly closeClient: () => Promise<void>;
  private readonly blockMs: number;
  private readonly readCount: number;
  private readonly sleep: SleepFn;
  private pollPromise: Promise<void> | null = null;
  private readonly handlers: HandEventHandlers;

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
      return (await getManager().getBlockingClientOrNull()) as unknown as RedisStreamClient | null;
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

    try {
      await client.xGroupCreate(this.streamKey, this.groupName, "0", { MKSTREAM: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("BUSYGROUP")) {
        logger.warn({ message }, "Error creating consumer group");
      }
    }

    this.isRunning = true;
    logger.info("Player EventConsumer started");

    this.pollPromise = this.poll(client).catch((error: unknown) => {
      if (!this.isRunning) {
        return;
      }
      logger.error({ err: error }, "EventConsumer poll loop crashed");
    });
  }

  private async poll(client: RedisStreamClient): Promise<void> {
    while (this.isRunning) {
      try {
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
            await this.processMessage(client, message);
          }
        }
      } catch (error: unknown) {
        if (!this.isRunning) {
          return;
        }

        const message = error instanceof Error ? error.message : "unknown";
        logger.error({ message }, "Error polling events");
        await this.sleep(1000);
      }
    }
  }

  private async processMessage(
    client: RedisStreamClient,
    message: { id: string; message: Record<string, unknown> },
  ): Promise<void> {
    try {
      const rawData = message.message.data;
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      logger.error({ message }, "Error processing event message");
    } finally {
      try {
        await client.xAck(this.streamKey, this.groupName, message.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "unknown";
        logger.error({ message }, "Error acknowledging event message");
      }
    }
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
    await this.closeClient();
    if (this.pollPromise) {
      await this.pollPromise.catch(() => undefined);
      this.pollPromise = null;
    }
  }
}
