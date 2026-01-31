import type { ServiceBootstrapStep } from './serviceBootstrap';

export type CreateOtelBootstrapStepOptions = {
  /**
   * If false, the step is a no-op.
   *
   * Useful for skipping OTel in tests or in environments where it's disabled.
   */
  isEnabled?: () => boolean;
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  /**
   * Name used when registering the shutdown hook.
   *
   * Defaults to `otel.shutdown`.
   */
  shutdownName?: string;
  /**
   * Called if `stop()` throws while handling a `start()` error.
   *
   * The original `start()` error is always rethrown.
   */
  onStopAfterStartError?: (error: unknown) => void;
};

/**
 * Factory Method: creates a reusable Service Bootstrap step for OpenTelemetry
 * SDK lifecycle wiring (start + shutdown registration).
 */
export function createOtelBootstrapStep<TState extends Record<string, unknown> = Record<string, never>>(
  options: CreateOtelBootstrapStepOptions,
): ServiceBootstrapStep<TState>['run'] {
  const isEnabled = options.isEnabled ?? (() => true);
  const shutdownName = options.shutdownName ?? 'otel.shutdown';

  return async ({ onShutdown }) => {
    if (!isEnabled()) {
      return;
    }

    try {
      await Promise.resolve(options.start());
    } catch (error: unknown) {
      try {
        await Promise.resolve(options.stop());
      } catch (stopError: unknown) {
        options.onStopAfterStartError?.(stopError);
      }
      throw error;
    }

    onShutdown(shutdownName, async () => {
      await Promise.resolve(options.stop());
    });
  };
}
