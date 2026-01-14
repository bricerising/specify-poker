import redisClient from "./redisClient";
import { GameEvent } from "../domain/types";

const STREAM_PREFIX = "event:streams";

export interface StreamMessage {
  id: string;
  message: Record<string, string>;
}

export interface StreamResponse {
  name: string;
  messages: StreamMessage[];
}

function streamKey(streamId: string): string {
  return `${STREAM_PREFIX}:${streamId}:events`;
}

export class StreamStore {
  async publish(streamId: string, event: GameEvent): Promise<void> {
    await redisClient.xAdd(streamKey(streamId), "*", {
      data: JSON.stringify(event),
    });
  }

  async publishEvent(event: GameEvent): Promise<void> {
    const streamIds = [
      "all",
      `table:${event.tableId}`,
      event.handId ? `hand:${event.handId}` : null,
      event.userId ? `user:${event.userId}` : null,
    ].filter((streamId): streamId is string => Boolean(streamId));

    for (const streamId of streamIds) {
      await this.publish(streamId, event);
    }
  }

  async read(
    streamId: string,
    lastId: string,
    count = 10,
    blockMs = 5000
  ): Promise<StreamResponse[] | null> {
    const result = await redisClient.xRead(
      [{ key: streamKey(streamId), id: lastId }],
      { COUNT: count, BLOCK: blockMs }
    );
    return result ? (result as StreamResponse[]) : null;
  }
}

export const streamStore = new StreamStore();
