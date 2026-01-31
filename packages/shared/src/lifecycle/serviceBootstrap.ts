import { createShutdownManager, type ShutdownAction, type ShutdownManager } from './shutdown';

type ServiceBootstrapState = Record<string, unknown>;
type EmptyServiceBootstrapState = Record<string, never>;

export type ServiceBootstrapLogger = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type ServiceBootstrapContext<TState extends ServiceBootstrapState = EmptyServiceBootstrapState> =
  {
  shutdown: ShutdownManager;
  onShutdown: (name: string, action: ShutdownAction) => void;
  /**
   * Mutable state bag shared across steps for a single service start.
   *
   * Use {@link ServiceBootstrapBuilder.stepWithState} to add strongly-typed
   * state from earlier steps (e.g. loaded config, created app instances).
   */
  state: TState;
};

export type ServiceBootstrap<TResult> = {
  main(): Promise<TResult>;
  shutdown(): Promise<void>;
  isRunning(): boolean;
};

export type ServiceBootstrapStep<TState extends ServiceBootstrapState = EmptyServiceBootstrapState> =
  {
  name: string;
  run: (ctx: ServiceBootstrapContext<TState>) => void | Promise<void>;
};

export type ServiceBootstrapBuilder<TState extends ServiceBootstrapState = EmptyServiceBootstrapState> =
  {
  step(name: string, run: ServiceBootstrapStep<TState>['run']): ServiceBootstrapBuilder<TState>;
  stepWithState<TAdded extends ServiceBootstrapState>(
    name: string,
    run: (ctx: ServiceBootstrapContext<TState>) => TAdded | Promise<TAdded>,
  ): ServiceBootstrapBuilder<TState & TAdded>;
  build<TResult>(options: {
    run: (ctx: ServiceBootstrapContext<TState>) => Promise<TResult>;
    onStartWhileRunning?: 'restart' | 'throw';
  }): ServiceBootstrap<TResult>;
};

type BuilderState = {
  logger?: ServiceBootstrapLogger;
  serviceName?: string;
  steps: readonly ServiceBootstrapStep<ServiceBootstrapState>[];
};

function createBuilder<TState extends ServiceBootstrapState>(
  state: BuilderState,
): ServiceBootstrapBuilder<TState> {
  return {
    step: (name, run) =>
      createBuilder<TState>({
        ...state,
        steps: [
          ...state.steps,
          { name, run: run as unknown as ServiceBootstrapStep<ServiceBootstrapState>['run'] },
        ],
      }),
    stepWithState: <TAdded extends ServiceBootstrapState>(
      name: string,
      run: (ctx: ServiceBootstrapContext<TState>) => TAdded | Promise<TAdded>,
    ): ServiceBootstrapBuilder<TState & TAdded> =>
      createBuilder<TState & TAdded>({
        ...state,
        steps: [
          ...state.steps,
          {
            name,
            run: async (ctx) => {
              const added = await run(ctx as unknown as ServiceBootstrapContext<TState>);
              Object.assign(ctx.state, added);
            },
          },
        ],
      }),
    build: <TResult>({
      run,
      onStartWhileRunning,
    }: {
      run: (ctx: ServiceBootstrapContext<TState>) => Promise<TResult>;
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

        const ctx: ServiceBootstrapContext<TState> = {
          shutdown: shutdownManager,
          onShutdown: (name, action) => shutdownManager.add(name, action),
          state: Object.create(null) as TState,
        };

        let currentStep: string | null = null;

        try {
          for (const step of state.steps) {
            currentStep = step.name;
            await (step.run as unknown as ServiceBootstrapStep<TState>['run'])(ctx);
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
  return createBuilder<EmptyServiceBootstrapState>({
    logger: options.logger,
    serviceName: options.serviceName,
    steps: [],
  });
}
