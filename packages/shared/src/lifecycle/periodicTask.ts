export type PeriodicTaskLogger = {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type PeriodicTask = {
  start(): void;
  stop(): void;
  isRunning(): boolean;
};

export type CreatePeriodicTaskOptions = {
  name: string;
  intervalMs: number;
  run: (ctx: { signal: AbortSignal }) => Promise<void> | void;
  runOnStart?: boolean;
  logger?: PeriodicTaskLogger;
};

export function createPeriodicTask(options: CreatePeriodicTaskOptions): PeriodicTask {
  const runOnStart = options.runOnStart ?? false;

  let controller: AbortController | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> | null = null;

  const clearTimeoutIfNeeded = (): void => {
    if (!timeoutId) {
      return;
    }
    clearTimeout(timeoutId);
    timeoutId = null;
  };

  const scheduleNextRun = (signal: AbortSignal): void => {
    if (signal.aborted) {
      return;
    }

    clearTimeoutIfNeeded();
    timeoutId = setTimeout(() => {
      void runOnce(signal);
    }, options.intervalMs);
  };

  const runOnce = async (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) {
      return;
    }
    if (inFlight) {
      return;
    }

    inFlight = (async () => {
      try {
        await options.run({ signal });
      } catch (err: unknown) {
        (options.logger?.error ?? options.logger?.warn)?.({ err, task: options.name }, "periodic_task.run.failed");
      } finally {
        inFlight = null;
        scheduleNextRun(signal);
      }
    })();
  };

  const start = (): void => {
    if (controller && !controller.signal.aborted) {
      return;
    }

    controller = new AbortController();
    const signal = controller.signal;

    if (runOnStart) {
      void runOnce(signal);
      return;
    }

    scheduleNextRun(signal);
  };

  const stop = (): void => {
    controller?.abort();
    controller = null;
    clearTimeoutIfNeeded();
  };

  return {
    start,
    stop,
    isRunning: () => Boolean(controller && !controller.signal.aborted),
  };
}

