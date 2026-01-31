import { createAsyncLifecycle, type AsyncLifecycle } from '../lifecycle/asyncLifecycle';

export type OtelSdkLike = {
  start: () => unknown;
  shutdown: () => unknown;
};

export type CreateOtelSdkLifecycleOptions<TSdk extends OtelSdkLike> = {
  /**
   * Creates a fresh SDK instance.
   *
   * This is called lazily (first start) and may be called again if a previous start
   * attempt failed or after a stop.
   */
  createSdk: () => TSdk;
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
        options.onStarted?.();
      } catch (error: unknown) {
        options.onStartError?.(error);
        try {
          await Promise.resolve(currentSdk.shutdown());
        } catch (shutdownError: unknown) {
          options.onShutdownAfterStartError?.(shutdownError);
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
        options.onStopped?.();
      } catch (error: unknown) {
        options.onStopError?.(error);
        throw error;
      }
    },
  });
}

