import type { RedisClient } from './redisClientManager';

export type RedisStreamConsumerClient = Pick<RedisClient, 'xGroupCreate' | 'xReadGroup' | 'xAck'>;

type RedisStreamReadGroupReply = Awaited<ReturnType<RedisStreamConsumerClient['xReadGroup']>>;
type RedisStreamReadGroupResponse = Exclude<RedisStreamReadGroupReply, null>;

export type RedisStreamConsumerMessage = {
  id: string;
  fields: Record<string, unknown>;
};

export type RedisStreamConsumerMessageOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown };

export type RedisStreamConsumerAckStrategy = (params: {
  readonly message: RedisStreamConsumerMessage;
  readonly outcome: RedisStreamConsumerMessageOutcome;
}) => boolean;

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
  shouldAck?: RedisStreamConsumerAckStrategy;

  readCount?: number;
  blockMs?: number;
  retryMs?: number;
  sleep?: (ms: number) => Promise<void>;

  groupStartId?: string;
  mkStream?: boolean;
  isBusyGroupError?: (error: unknown) => boolean;

  logger?: RedisStreamConsumerLogger;
};

export async function runRedisStreamConsumer(
  signal: AbortSignal,
  options: RedisStreamConsumerOptions,
): Promise<void> {
  const readCount = options.readCount ?? 10;
  const blockMs = options.blockMs ?? 5000;
  const retryMs = options.retryMs ?? 1000;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const groupStartId = options.groupStartId ?? '0';
  const mkStream = options.mkStream ?? true;

  const isBusyGroupError =
    options.isBusyGroupError ??
    ((error: unknown) => {
      if (!error || typeof error !== 'object') {
        return false;
      }
      const message = (error as { message?: unknown }).message;
      return typeof message === 'string' && message.includes('BUSYGROUP');
    });

  const logger = options.logger;

  const logWarn = (obj: Record<string, unknown>, msg: string) => {
    const fn = logger?.warn ?? logger?.error;
    fn?.call(logger, obj, msg);
  };

  const aborted = new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });

  const sleepUnlessAborted = async (ms: number): Promise<void> => {
    if (signal.aborted) {
      return;
    }
    await Promise.race([sleep(ms), aborted]);
  };

  const toStringMessageId = (id: unknown): string => {
    if (typeof id === 'string') {
      return id;
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(id)) {
      return id.toString('utf8');
    }
    return String(id);
  };

  const shouldAck: RedisStreamConsumerAckStrategy = options.shouldAck ?? (() => true);

  while (!signal.aborted) {
    let client: RedisStreamConsumerClient;
    try {
      client = await options.getClient();
    } catch (error: unknown) {
      logWarn(
        { err: error, streamKey: options.streamKey },
        'redis_stream_consumer.get_client.failed',
      );
      await sleepUnlessAborted(retryMs);
      continue;
    }

    try {
      await client.xGroupCreate(
        options.streamKey,
        options.groupName,
        groupStartId,
        mkStream ? { MKSTREAM: true } : undefined,
      );
    } catch (error: unknown) {
      if (!isBusyGroupError(error)) {
        logWarn(
          { err: error, streamKey: options.streamKey },
          'redis_stream_consumer.group_create.failed',
        );
        await sleepUnlessAborted(retryMs);
        continue;
      }
    }

    let streams: RedisStreamReadGroupReply;
    try {
      streams = await client.xReadGroup(
        options.groupName,
        options.consumerName,
        [{ key: options.streamKey, id: '>' }],
        { COUNT: readCount, BLOCK: blockMs },
      );
    } catch (error: unknown) {
      logWarn({ err: error, streamKey: options.streamKey }, 'redis_stream_consumer.read.failed');
      await sleepUnlessAborted(retryMs);
      continue;
    }

    if (!streams) {
      continue;
    }

    for (const stream of streams as RedisStreamReadGroupResponse) {
      for (const message of stream.messages) {
        const messageId = toStringMessageId(message.id);
        const consumerMessage: RedisStreamConsumerMessage = {
          id: messageId,
          fields: message.message,
        };
        let outcome: RedisStreamConsumerMessageOutcome = { ok: true };

        try {
          await options.onMessage(consumerMessage);
        } catch (error: unknown) {
          outcome = { ok: false, error };
          const fn = logger?.error ?? logger?.warn;
          fn?.call(
            logger,
            { err: error, streamKey: options.streamKey, messageId },
            'redis_stream_consumer.message.failed',
          );
        }

        let shouldAckMessage: boolean;
        try {
          shouldAckMessage = shouldAck({ message: consumerMessage, outcome });
        } catch (error: unknown) {
          shouldAckMessage = true;
          const fn = logger?.error ?? logger?.warn;
          fn?.call(
            logger,
            { err: error, streamKey: options.streamKey, messageId },
            'redis_stream_consumer.should_ack.failed',
          );
        }

        if (shouldAckMessage) {
          try {
            await client.xAck(options.streamKey, options.groupName, messageId);
          } catch (error: unknown) {
            logWarn(
              { err: error, streamKey: options.streamKey, messageId },
              'redis_stream_consumer.ack.failed',
            );
          }
        }

        if (signal.aborted) {
          return;
        }
      }
    }
  }
}
