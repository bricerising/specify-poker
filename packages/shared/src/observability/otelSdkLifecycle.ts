import { createAsyncLifecycle, type AsyncLifecycle } from '../lifecycle/asyncLifecycle';

export type OtelSdkLike = {
  start: () => unknown;
  shutdown: () => unknown;
};

export type OtelSdkLifecycleLogger = {
  info?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  error?: (...args: unknown[]) => unknown;
};

export type CreateOtelSdkLifecycleOptions<TSdk extends OtelSdkLike> = {
  /**
   * Creates a fresh SDK instance.
   *
   * This is called lazily (first start) and may be called again if a previous start
   * attempt failed or after a stop.
   */
  createSdk: () => TSdk;
  /**
   * Optional logger used for default start/stop/error hooks.
   *
   * If you pass a logger but also pass explicit hooks, the explicit hooks win.
   */
  logger?: OtelSdkLifecycleLogger;
  onStarted?: () => void;
  onStopped?: () => void;
  onStartError?: (error: unknown) => void;
  onStopError?: (error: unknown) => void;
  onShutdownAfterStartError?: (error: unknown) => void;
};

/**
 * Facade over OpenTelemetry SDK start/stop with:
 * - lazy SDK creation
 * - safe concurrent start/stop calls (via {@link createAsyncLifecycle})
 * - best-effort shutdown if start fails
 *
 * Works with SDK implementations where `start()` / `shutdown()` may be sync or async.
 */
export function createOtelSdkLifecycle<TSdk extends OtelSdkLike>(
  options: CreateOtelSdkLifecycleOptions<TSdk>,
): AsyncLifecycle {
  let sdk: TSdk | null = null;

  const logger = options.logger;
  const logInfo = logger?.info;
  const logWarn = logger?.warn ?? logger?.error;
  const logError = logger?.error ?? logger?.warn;

  const onStarted =
    options.onStarted ??
    (logInfo ? () => void logInfo.call(logger, 'OpenTelemetry SDK started') : undefined);
  const onStopped =
    options.onStopped ??
    (logInfo ? () => void logInfo.call(logger, 'OpenTelemetry SDK shut down') : undefined);
  const onStartError =
    options.onStartError ??
    (logError
      ? (error: unknown) =>
          void logError.call(logger, { err: error }, 'Failed to start OpenTelemetry SDK')
      : undefined);
  const onStopError =
    options.onStopError ??
    (logError
      ? (error: unknown) =>
          void logError.call(logger, { err: error }, 'Failed to shut down OpenTelemetry SDK')
      : undefined);
  const onShutdownAfterStartError =
    options.onShutdownAfterStartError ??
    (logWarn
      ? (error: unknown) =>
          void logWarn.call(
            logger,
            { err: error },
            'OpenTelemetry SDK shutdown failed after start error',
          )
      : undefined);

  const getOrCreateSdk = (): TSdk => {
    if (sdk) {
      return sdk;
    }
    sdk = options.createSdk();
    return sdk;
  };

  return createAsyncLifecycle({
    start: async () => {
      const currentSdk = getOrCreateSdk();
      try {
        await Promise.resolve(currentSdk.start());
        onStarted?.();
      } catch (error: unknown) {
        onStartError?.(error);
        try {
          await Promise.resolve(currentSdk.shutdown());
        } catch (shutdownError: unknown) {
          onShutdownAfterStartError?.(shutdownError);
        } finally {
          sdk = null;
        }
        throw error;
      }
    },
    stop: async () => {
      const currentSdk = sdk;
      sdk = null;
      if (!currentSdk) {
        return;
      }

      try {
        await Promise.resolve(currentSdk.shutdown());
        onStopped?.();
      } catch (error: unknown) {
        onStopError?.(error);
        throw error;
      }
    },
  });
}
