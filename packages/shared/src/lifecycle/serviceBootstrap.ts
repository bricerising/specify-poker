import { createShutdownManager, type ShutdownAction, type ShutdownManager } from './shutdown';

export type ServiceBootstrapLogger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type ServiceBootstrapContext = {
  shutdown: ShutdownManager;
  onShutdown: (name: string, action: ShutdownAction) => void;
};

export type ServiceBootstrap<TResult> = {
  main(): Promise<TResult>;
  shutdown(): Promise<void>;
  isRunning(): boolean;
};

export type ServiceBootstrapStep = {
  name: string;
  run: (ctx: ServiceBootstrapContext) => void | Promise<void>;
};

export type ServiceBootstrapBuilder = {
  step(name: string, run: ServiceBootstrapStep['run']): ServiceBootstrapBuilder;
  build<TResult>(options: {
    run: (ctx: ServiceBootstrapContext) => Promise<TResult>;
    onStartWhileRunning?: 'restart' | 'throw';
  }): ServiceBootstrap<TResult>;
};

type BuilderState = {
  logger?: ServiceBootstrapLogger;
  serviceName?: string;
  steps: readonly ServiceBootstrapStep[];
};

function createBuilder(state: BuilderState): ServiceBootstrapBuilder {
  return {
    step: (name, run) => createBuilder({ ...state, steps: [...state.steps, { name, run }] }),
    build: <TResult>({
      run,
      onStartWhileRunning,
    }: {
      run: (ctx: ServiceBootstrapContext) => Promise<TResult>;
      onStartWhileRunning?: 'restart' | 'throw';
    }): ServiceBootstrap<TResult> => {
      const mode = onStartWhileRunning ?? 'restart';

      let runningShutdown: ShutdownManager | null = null;

      const isRunning = (): boolean => runningShutdown !== null;

      const shutdown = async (): Promise<void> => {
        const shutdownManager = runningShutdown;
        runningShutdown = null;
        await shutdownManager?.run();
      };

      const main = async (): Promise<TResult> => {
        if (runningShutdown) {
          switch (mode) {
            case 'restart': {
              state.logger?.warn?.(
                { service: state.serviceName },
                'service.already_running.restart',
              );
              await shutdown();
              break;
            }
            case 'throw': {
              throw new Error('Service is already running');
            }
          }
        }

        const shutdownManager = createShutdownManager({ logger: state.logger });
        runningShutdown = shutdownManager;

        const ctx: ServiceBootstrapContext = {
          shutdown: shutdownManager,
          onShutdown: (name, action) => shutdownManager.add(name, action),
        };

        let currentStep: string | null = null;

        try {
          for (const step of state.steps) {
            currentStep = step.name;
            await step.run(ctx);
          }

          currentStep = 'run';
          return await run(ctx);
        } catch (error: unknown) {
          state.logger?.error?.(
            { err: error, step: currentStep, service: state.serviceName },
            'service.start.failed',
          );
          try {
            await shutdownManager.run();
          } finally {
            runningShutdown = null;
          }
          throw error;
        } finally {
          currentStep = null;
        }
      };

      return {
        main,
        shutdown,
        isRunning,
      };
    },
  };
}

export function createServiceBootstrapBuilder(options: {
  logger?: ServiceBootstrapLogger;
  serviceName?: string;
}): ServiceBootstrapBuilder {
  return createBuilder({ logger: options.logger, serviceName: options.serviceName, steps: [] });
}
