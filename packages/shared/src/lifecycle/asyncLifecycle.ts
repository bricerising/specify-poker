/**
 * Async lifecycle manager for coordinating start/stop operations.
 *
 * Provides a state machine that safely handles concurrent start/stop calls,
 * ensuring proper sequencing and preventing race conditions.
 *
 * @example
 * ```ts
 * const lifecycle = createAsyncLifecycle({
 *   start: async () => {
 *     await connectToDatabase();
 *     await startServer();
 *   },
 *   stop: async () => {
 *     await stopServer();
 *     await disconnectFromDatabase();
 *   },
 * });
 *
 * await lifecycle.start();
 * // ... service is running
 * await lifecycle.stop();
 * ```
 */

export type LifecycleStatus = 'stopped' | 'starting' | 'running' | 'stopping';

type LifecycleState =
  | { status: 'stopped' }
  | { status: 'starting'; promise: Promise<void> }
  | { status: 'running' }
  | { status: 'stopping'; promise: Promise<void> };

export type AsyncLifecycle = {
  /** Start the lifecycle. Safe to call multiple times - will wait if already starting. */
  start(): Promise<void>;
  /** Stop the lifecycle. Safe to call multiple times - will wait if already stopping. */
  stop(): Promise<void>;
  /** Get the current lifecycle status. */
  getStatus(): LifecycleStatus;
  /** Check if the lifecycle is currently running. */
  isRunning(): boolean;
};

export type AsyncLifecycleImpl = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createAsyncLifecycle(impl: AsyncLifecycleImpl): AsyncLifecycle {
  let state: LifecycleState = { status: 'stopped' };

  const start = async (): Promise<void> => {
    while (true) {
      switch (state.status) {
        case 'running': {
          return;
        }
        case 'starting': {
          await state.promise;
          return;
        }
        case 'stopping': {
          await state.promise;
          continue;
        }
        case 'stopped': {
          const promise = impl.start();
          state = { status: 'starting', promise };
          try {
            await promise;
            state = { status: 'running' };
          } catch (error: unknown) {
            state = { status: 'stopped' };
            throw error;
          }
          return;
        }
      }
    }
  };

  const stop = async (): Promise<void> => {
    while (true) {
      switch (state.status) {
        case 'stopped': {
          return;
        }
        case 'stopping': {
          await state.promise;
          return;
        }
        case 'starting': {
          try {
            await state.promise;
          } catch {
            return;
          }
          continue;
        }
        case 'running': {
          const promise = impl.stop();
          state = { status: 'stopping', promise };
          try {
            await promise;
          } finally {
            state = { status: 'stopped' };
          }
          return;
        }
      }
    }
  };

  return {
    start,
    stop,
    getStatus: () => state.status,
    isRunning: () => state.status === 'running',
  };
}
