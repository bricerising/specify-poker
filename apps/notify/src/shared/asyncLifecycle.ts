export type LifecycleStatus = 'stopped' | 'starting' | 'running' | 'stopping';

type LifecycleState =
  | { status: 'stopped' }
  | { status: 'starting'; promise: Promise<void> }
  | { status: 'running' }
  | { status: 'stopping'; promise: Promise<void> };

export type AsyncLifecycle = {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): LifecycleStatus;
  isRunning(): boolean;
};

export function createAsyncLifecycle(impl: {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}): AsyncLifecycle {
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
