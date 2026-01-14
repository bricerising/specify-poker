import { createClient } from "redis";
import { getRedisUrl } from "../storage/redisClient";
import { incrementHandsPlayed, incrementWins } from "./statisticsService";
import logger from "../observability/logger";

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
    this.poll();
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
              const event = JSON.parse(message.message.data as string) as { type?: string; payload?: unknown };
              await this.handleEvent(event);
              await client.xAck(this.streamKey, this.groupName, message.id);
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

  private async handleEvent(event: { type?: string; payload?: unknown }): Promise<void> {
    try {
      const { type, payload } = event;
      const handler = type ? this.handlers[type] : undefined;
      if (!handler) {
        return;
      }
      const data = this.decodePayload(payload);

      await handler(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      logger.error({ message }, "Error handling event");
    }
  }

  private decodePayload(payload: unknown): Record<string, unknown> {
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if ("fields" in record && record.fields && typeof record.fields === "object") {
        return this.fromStruct(record as { fields: Record<string, unknown> });
      }
      return record;
    }
    return {};
  }

  private fromStruct(struct: { fields: Record<string, unknown> }): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(struct.fields)) {
      result[key] = this.fromValue(value);
    }
    return result;
  }

  private fromValue(value: unknown): unknown {
    if (!value || typeof value !== "object") {
      return value;
    }
    const record = value as Record<string, unknown>;
    if ("stringValue" in record) return record.stringValue as string;
    if ("numberValue" in record) return record.numberValue as number;
    if ("boolValue" in record) return record.boolValue as boolean;
    if ("listValue" in record && record.listValue && typeof record.listValue === "object") {
      const list = record.listValue as { values?: unknown[] };
      return (list.values ?? []).map((v) => this.fromValue(v));
    }
    if ("structValue" in record && record.structValue && typeof record.structValue === "object") {
      const struct = record.structValue as { fields: Record<string, unknown> };
      return this.fromStruct(struct);
    }
    if ("nullValue" in record) return null;
    return value;
  }

  stop(): void {
    this.isRunning = false;
    if (this.client) {
      void this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }
}
