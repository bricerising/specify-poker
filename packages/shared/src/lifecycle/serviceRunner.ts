export type ServiceRunnerLogger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type ProcessLike = {
  on(event: string, listener: (...args: unknown[]) => void): void;
};

export type RunServiceMainOptions = {
  main: () => Promise<unknown>;
  shutdown: () => Promise<void>;
  logger?: ServiceRunnerLogger;
  process?: ProcessLike;
  exit?: (code: number) => void;
  signals?: readonly string[];
  fatalExitCode?: number;
};

export function runServiceMain(options: RunServiceMainOptions): void {
  const proc = options.process ?? process;
  const exit = options.exit ?? process.exit;
  const fatalExitCode = options.fatalExitCode ?? 1;
  const signals = options.signals ?? ['SIGINT', 'SIGTERM'];

  let shutdownPromise: Promise<void> | null = null;
  let isExiting = false;

  const safeShutdown = async (): Promise<void> => {
    if (!shutdownPromise) {
      shutdownPromise = options.shutdown();
    }
    await shutdownPromise;
  };

  const requestExit = (code: number, error?: unknown): void => {
    if (isExiting) {
      return;
    }
    isExiting = true;

    if (error !== undefined) {
      options.logger?.error?.({ err: error }, 'service.failed');
    }

    safeShutdown().finally(() => exit(code));
  };

  proc.on('uncaughtException', (error: unknown) => {
    requestExit(fatalExitCode, error);
  });
  proc.on('unhandledRejection', (reason: unknown) => {
    requestExit(fatalExitCode, reason);
  });

  for (const signal of signals) {
    proc.on(signal, () => {
      options.logger?.info?.({ signal }, 'service.shutdown.signal');
      requestExit(0);
    });
  }

  void Promise.resolve()
    .then(() => options.main())
    .catch((error: unknown) => {
      requestExit(fatalExitCode, error);
    });
}
