import { createAsyncLifecycle, type AsyncLifecycle } from '../lifecycle/asyncLifecycle';
import { exponentialBackoff, type RetryStrategy } from '../retry';
import {
  runRedisStreamConsumer,
  type RedisStreamConsumerClient,
  type RedisStreamConsumerOptions,
} from './streamConsumer';

export type RedisStreamConsumerLifecycle = {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
};

export type CreateRedisStreamConsumerLifecycleOptions = Omit<RedisStreamConsumerOptions, 'getClient'> & {
  enabled?: boolean;
  getClient: () => Promise<RedisStreamConsumerClient>;
  closeClient?: () => Promise<void>;
  runConsumer?: typeof runRedisStreamConsumer;
};

export function createRedisStreamConsumerLifecycle(
  options: CreateRedisStreamConsumerLifecycleOptions,
): RedisStreamConsumerLifecycle {
  const enabled = options.enabled ?? true;
  const closeClient = options.closeClient;
  const runConsumer = options.runConsumer ?? runRedisStreamConsumer;

  const { enabled: _enabled, closeClient: _closeClient, runConsumer: _runConsumer, ...consumerOptions } =
    options;

  let controller: AbortController | null = null;
  let pollPromise: Promise<void> | null = null;

  const retryStrategy: RetryStrategy = exponentialBackoff({
    baseMs: 1000,
    maxMs: 30_000,
  });

  const lifecycle: AsyncLifecycle = createAsyncLifecycle({
    start: async () => {
      if (!enabled) {
        return;
      }

      if (controller && !controller.signal.aborted) {
        return;
      }

      const nextController = new AbortController();
      controller = nextController;
      const signal = nextController.signal;

      const sleep =
        consumerOptions.sleep ??
        ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

      const runSupervisor = async (): Promise<void> => {
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

        const logWarn = (obj: Record<string, unknown>, msg: string): void => {
          const logger = consumerOptions.logger;
          const fn = logger?.warn ?? logger?.error;
          fn?.call(logger, obj, msg);
        };

        const logError = (obj: Record<string, unknown>, msg: string): void => {
          const logger = consumerOptions.logger;
          const fn = logger?.error ?? logger?.warn;
          fn?.call(logger, obj, msg);
        };

        let attempt = 0;
        while (!signal.aborted) {
          try {
            await runConsumer(signal, consumerOptions);
            if (signal.aborted) {
              return;
            }

            attempt = 0;
            logWarn(
              { streamKey: consumerOptions.streamKey, groupName: consumerOptions.groupName },
              'redis_stream_consumer.lifecycle.exited_unexpectedly',
            );
            await sleepUnlessAborted(1000);
          } catch (error: unknown) {
            if (signal.aborted) {
              return;
            }

            attempt += 1;
            const delayMs = retryStrategy.getDelayMs(attempt);
            logError(
              {
                err: error,
                attempt,
                delayMs,
                streamKey: consumerOptions.streamKey,
                groupName: consumerOptions.groupName,
              },
              'redis_stream_consumer.lifecycle.crashed',
            );
            await sleepUnlessAborted(delayMs);
          }
        }
      };

      pollPromise = runSupervisor()
        .catch((error: unknown) => {
          if (signal.aborted) {
            return;
          }

          const logger = consumerOptions.logger;
          const fn = logger?.error ?? logger?.warn;
          fn?.call(
            logger,
            { err: error, streamKey: options.streamKey, groupName: options.groupName },
            'redis_stream_consumer.lifecycle.supervisor.crashed',
          );
        })
        .finally(() => {
          if (controller === nextController && !nextController.signal.aborted) {
            controller = null;
          }
        });
    },
    stop: async () => {
      controller?.abort();
      controller = null;

      try {
        await closeClient?.();
      } catch (error: unknown) {
        const logger = consumerOptions.logger;
        const fn = logger?.error ?? logger?.warn;
        fn?.call(
          logger,
          { err: error, streamKey: options.streamKey, groupName: options.groupName },
          'redis_stream_consumer.lifecycle.close_client.failed',
        );
      }

      const pendingPoll = pollPromise;
      pollPromise = null;
      await pendingPoll?.catch(() => undefined);
    },
  });

  return {
    start: lifecycle.start,
    stop: lifecycle.stop,
    isRunning: () => Boolean(controller && !controller.signal.aborted),
  };
}
