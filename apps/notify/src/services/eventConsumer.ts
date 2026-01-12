import { RedisClientType } from 'redis';
import { getRedisClient } from '../storage/redisClient';
import { PushService } from './pushService';

export class EventConsumer {
  private pushService: PushService;
  private isRunning: boolean = false;
  private streamKey: string = 'events:game';
  private groupName: string = 'notify-service';
  private consumerName: string = `consumer-${process.pid}`;

  constructor(pushService: PushService) {
    this.pushService = pushService;
  }

  async start(): Promise<void> {
    const client = await getRedisClient();
    this.isRunning = true;

    try {
      await client.xGroupCreate(this.streamKey, this.groupName, '0', { MKSTREAM: true });
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        console.error('Error creating consumer group:', err);
      }
    }

    console.log(`EventConsumer started, listening on ${this.streamKey}`);
    this.poll();
  }

  private async poll(): Promise<void> {
    const client = await getRedisClient();
    while (this.isRunning) {
      try {
        const streams = await client.xReadGroup(
          this.groupName,
          this.consumerName,
          [{ key: this.streamKey, id: '>' }],
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
        console.error('Error polling events:', err);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async handleEvent(message: Record<string, string>): Promise<void> {
    try {
      const type = message.type;
      if (type === 'TURN_STARTED') {
        const userId = message.userId;
        const tableId = message.tableId;

        if (userId) {
          console.log(`Triggering turn alert for user ${userId} at table ${tableId}`);
          await this.pushService.sendToUser(userId, {
            title: "It's your turn!",
            body: `Action is on you at table ${tableId || 'unknown'}.`,
            url: tableId ? `/tables/${tableId}` : '/',
            tag: `turn-${tableId}`,
            data: {
              type: 'turn_alert',
              tableId,
            },
          });
        }
      }
    } catch (err) {
      console.error('Error handling event:', err);
    }
  }

  stop(): void {
    this.isRunning = false;
  }
}
