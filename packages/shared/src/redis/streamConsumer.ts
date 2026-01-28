export type RedisStreamConsumerClient = {
  xGroupCreate: (
    streamKey: string,
    groupName: string,
    id: string,
    options: { MKSTREAM: boolean },
  ) => Promise<unknown>;
  xReadGroup: (
    groupName: string,
    consumerName: string,
    streams: Array<{ key: string; id: string }>,
    options: { COUNT: number; BLOCK: number },
  ) => Promise<RedisStreamReadGroupResponse | null>;
  xAck: (streamKey: string, groupName: string, messageId: string) => Promise<unknown>;
};

export type RedisStreamReadGroupResponse = Array<{
  messages: Array<{ id: string; message: Record<string, unknown> }>;
}>;

export type RedisStreamConsumerMessage = {
  id: string;
  fields: Record<string, unknown>;
};

export type RedisStreamConsumerLogger = {
  debug?: (obj: Record<string, unknown>, msg: string) => void;
  info?: (obj: Record<string, unknown>, msg: string) => void;
  warn?: (obj: Record<string, unknown>, msg: string) => void;
  error?: (obj: Record<string, unknown>, msg: string) => void;
};

export type RedisStreamConsumerOptions = {
  streamKey: string;
  groupName: string;
  consumerName: string;
  getClient: () => Promise<RedisStreamConsumerClient>;
  onMessage: (message: RedisStreamConsumerMessage) => Promise<void> | void;

  readCount?: number;
  blockMs?: number;
  retryMs?: number;
  sleep?: (ms: number) => Promise<void>;

  groupStartId?: string;
  mkStream?: boolean;
  isBusyGroupError?: (error: unknown) => boolean;

  logger?: RedisStreamConsumerLogger;
};

export async function runRedisStreamConsumer(signal: AbortSignal, options: RedisStreamConsumerOptions): Promise<void> {
  const readCount = options.readCount ?? 10;
  const blockMs = options.blockMs ?? 5000;
  const retryMs = options.retryMs ?? 1000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const groupStartId = options.groupStartId ?? "0";
  const mkStream = options.mkStream ?? true;

  const isBusyGroupError =
    options.isBusyGroupError ??
    ((error: unknown) => {
      if (!error || typeof error !== "object") {
        return false;
      }
      const message = (error as { message?: unknown }).message;
      return typeof message === "string" && message.includes("BUSYGROUP");
    });

  const logger = options.logger;

  const logWarn = (obj: Record<string, unknown>, msg: string) => {
    (logger?.warn ?? logger?.error)?.(obj, msg);
  };

  const sleepUnlessAborted = async (ms: number): Promise<void> => {
    if (signal.aborted) {
      return;
    }
    await sleep(ms);
  };

  while (!signal.aborted) {
    let client: RedisStreamConsumerClient;
    try {
      client = await options.getClient();
    } catch (error: unknown) {
      logWarn({ err: error, streamKey: options.streamKey }, "redis_stream_consumer.get_client.failed");
      await sleepUnlessAborted(retryMs);
      continue;
    }

    try {
      await client.xGroupCreate(options.streamKey, options.groupName, groupStartId, { MKSTREAM: mkStream });
    } catch (error: unknown) {
      if (!isBusyGroupError(error)) {
        logWarn({ err: error, streamKey: options.streamKey }, "redis_stream_consumer.group_create.failed");
        await sleepUnlessAborted(retryMs);
        continue;
      }
    }

    let streams: RedisStreamReadGroupResponse | null;
    try {
      streams = await client.xReadGroup(
        options.groupName,
        options.consumerName,
        [{ key: options.streamKey, id: ">" }],
        { COUNT: readCount, BLOCK: blockMs },
      );
    } catch (error: unknown) {
      logWarn({ err: error, streamKey: options.streamKey }, "redis_stream_consumer.read.failed");
      await sleepUnlessAborted(retryMs);
      continue;
    }

    if (!streams) {
      continue;
    }

    for (const stream of streams) {
      for (const message of stream.messages) {
        const messageId = message.id;

        try {
          await options.onMessage({ id: messageId, fields: message.message });
        } catch (error: unknown) {
          (logger?.error ?? logger?.warn)?.(
            { err: error, streamKey: options.streamKey, messageId },
            "redis_stream_consumer.message.failed",
          );
        } finally {
          try {
            await client.xAck(options.streamKey, options.groupName, messageId);
          } catch (error: unknown) {
            logWarn({ err: error, streamKey: options.streamKey, messageId }, "redis_stream_consumer.ack.failed");
          }
        }

        if (signal.aborted) {
          return;
        }
      }
    }
  }
}

