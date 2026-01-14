import { getRedisClient } from "../storage/redisClient";
import { PushSenderService } from "./pushSenderService";
import { getConfig } from "../config";
import logger from "../observability/logger";

export class EventConsumer {
  private pushService: PushSenderService;
  private isRunning: boolean = false;
  private streamKey: string;
  private groupName: string = "notify-service";
  private consumerName: string = `consumer-${process.pid}`;

  constructor(pushService: PushSenderService) {
    this.pushService = pushService;
    this.streamKey = getConfig().eventStreamKey;
  }

  async start(): Promise<void> {
    const client = await getRedisClient();
    this.isRunning = true;

    try {
      await client.xGroupCreate(this.streamKey, this.groupName, "0", { MKSTREAM: true });
    } catch {
      // Ignore BUSYGROUP errors if group already exists (simplification)
      // Check if it's a BUSYGROUP error if possible, otherwise log
      // For now, logging unexpected errors only
      // if (!(err instanceof Error) || !err.message.includes("BUSYGROUP")) {
      //   logger.error({ err }, "Error creating consumer group");
      // }
    }

    logger.info({ streamKey: this.streamKey }, "EventConsumer started");
    this.poll();
  }

  private async poll(): Promise<void> {
    const client = await getRedisClient();
    while (this.isRunning) {
      try {
        const streams = await client.xReadGroup(
          this.groupName,
          this.consumerName,
          [{ key: this.streamKey, id: ">" }],
          { COUNT: 1, BLOCK: 5000 }
        );

        if (streams) {
          for (const stream of streams) {
            for (const message of stream.messages) {
              await this.handleEvent(message.message);
              await client.xAck(this.streamKey, this.groupName, message.id);
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Error polling events");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async handleEvent(message: Record<string, string>): Promise<void> {
    try {
      const type = message.type;
      if (type === "TURN_STARTED") {
        const userId = message.userId;
        const tableId = message.tableId;

        if (userId) {
          logger.info({ userId, tableId }, "Triggering turn alert");
          await this.pushService.sendToUser(userId, {
            title: "It's your turn!",
            body: `Action is on you at table ${tableId || 'unknown'}.`,
            url: tableId ? `/tables/${tableId}` : '/',
            tag: `turn-${tableId}`,
            data: {
              type: "turn_alert",
              tableId,
            },
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "Error handling event");
    }
  }

  stop(): void {
    this.isRunning = false;
  }
}
