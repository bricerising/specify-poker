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

export function isTestEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test';
}

export function isDirectRun(): boolean {
  return typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;
}

export type RunServiceMainIfDirectRunOptions = RunServiceMainOptions & {
  isTestEnv?: () => boolean;
  isDirectRun?: () => boolean;
};

/**
 * Factory Method: conditionally runs {@link runServiceMain} only when this module
 * is executed directly (and not under tests).
 *
 * This keeps service `server.ts` entrypoints small and consistent while preserving
 * the ability to inject `process`/`exit` for tests.
 */
export function runServiceMainIfDirectRun(options: RunServiceMainIfDirectRunOptions): void {
  const shouldSkipForTests = options.isTestEnv ?? (() => isTestEnv());
  const shouldRunDirectly = options.isDirectRun ?? (() => isDirectRun());

  if (!shouldRunDirectly() || shouldSkipForTests()) {
    return;
  }

  runServiceMain({
    main: options.main,
    shutdown: options.shutdown,
    logger: options.logger,
    process: options.process,
    exit: options.exit,
    signals: options.signals,
    fatalExitCode: options.fatalExitCode,
  });
}

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

    safeShutdown()
      .catch((shutdownError: unknown) => {
        options.logger?.error?.({ err: shutdownError }, 'service.shutdown.failed');
      })
      .finally(() => exit(code));
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
