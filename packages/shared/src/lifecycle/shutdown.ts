export type ShutdownAction = () => void | Promise<void>;

export type ShutdownLogger = {
  error?: (obj: Record<string, unknown>, msg: string) => void;
};

export type ShutdownManager = {
  add(name: string, action: ShutdownAction): void;
  run(): Promise<void>;
};

export function createShutdownManager(options: { logger?: ShutdownLogger } = {}): ShutdownManager {
  const steps: Array<{ name: string; action: ShutdownAction }> = [];
  let runPromise: Promise<void> | null = null;

  const run = async (): Promise<void> => {
    for (const step of [...steps].reverse()) {
      try {
        await step.action();
      } catch (err: unknown) {
        options.logger?.error?.({ err, step: step.name }, "shutdown.step.failed");
      }
    }
  };

  return {
    add(name, action) {
      steps.push({ name, action });
    },
    run() {
      if (!runPromise) {
        runPromise = run();
      }
      return runPromise;
    },
  };
}

