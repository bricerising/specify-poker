import { createClient } from "redis";
import { getRedisUrl } from "../storage/redisClient";
import { incrementHandsPlayed, incrementWins } from "./statisticsService";
import logger from "../observability/logger";
import { decodeStructLike } from "@specify-poker/shared";

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

export class EventConsumer {
  private isRunning: boolean = false;
  private streamKey: string = "events:all";
  private groupName: string = "player-service";
  private consumerName: string = `consumer-${process.pid}`;
  private client: ReturnType<typeof createClient> | null = null;
  private handlers: Record<string, (data: Record<string, unknown>) => Promise<void>> = {
    HAND_STARTED: async (data) => {
      const participants = Array.isArray(data.participants) ? data.participants : [];
      for (const userId of participants) {
        if (typeof userId === "string" && userId) {
          await incrementHandsPlayed(userId);
        }
      }
    },
    HAND_ENDED: async (data) => {
      const winnerUserIds = Array.isArray(data.winnerUserIds) ? data.winnerUserIds : [];
      for (const userId of winnerUserIds) {
        if (typeof userId === "string" && userId) {
          await incrementWins(userId);
        }
      }
    },
  };

  async start(): Promise<void> {
    const url = getRedisUrl();
    if (!url) {
      logger.warn("Redis not available, EventConsumer will not start");
      return;
    }

    this.isRunning = true;
    const client = createClient({ url });
    client.on("error", (err) => {
      logger.warn({ message: err.message }, "redis.error");
    });
    await client.connect();
    this.client = client;

    try {
      await client.xGroupCreate(this.streamKey, this.groupName, "0", { MKSTREAM: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("BUSYGROUP")) {
        logger.warn({ message }, "Error creating consumer group");
      }
    }

    logger.info("Player EventConsumer started");
    void this.poll();
  }

  private async poll(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }

    while (this.isRunning) {
      try {
        const streams = await client.xReadGroup(
          this.groupName,
          this.consumerName,
          [{ key: this.streamKey, id: ">" }],
          { COUNT: 10, BLOCK: 5000 }
        );

        if (streams) {
          for (const stream of streams) {
            for (const message of stream.messages) {
              await this.processMessage(client, message);
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        logger.error({ message }, "Error polling events");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async processMessage(
    client: ReturnType<typeof createClient>,
    message: { id: string; message: Record<string, unknown> }
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      logger.error({ message }, "Error processing event message");
    } finally {
      try {
        await client.xAck(this.streamKey, this.groupName, message.id);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        logger.error({ message }, "Error acknowledging event message");
      }
    }
  }

  async handleEvent(event: unknown): Promise<void> {
    try {
      if (!isRecord(event)) {
        return;
      }
      const type = typeof event.type === "string" ? event.type : null;
      if (!type) {
        return;
      }
      const handler = this.handlers[type];
      if (!handler) {
        return;
      }

      const data = decodeStructLike(event.payload);

      await handler(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      logger.error({ message }, "Error handling event");
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.client) {
      void this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }
}
