import { AsyncLocalStorage } from 'async_hooks';

export interface KeyedLock {
  withLock<T>(key: string, work: () => Promise<T>): Promise<T>;
  reset(): void;
}

export function createKeyedLock(): KeyedLock {
  const locks = new Map<string, Promise<void>>();

  // Tracks locks held in the current async call chain so `withLock` is re-entrant.
  const context = new AsyncLocalStorage<Map<string, number>>();

  async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const store = context.getStore();
    const depth = store?.get(key) ?? 0;
    if (depth > 0 && store) {
      store.set(key, depth + 1);
      try {
        return await work();
      } finally {
        const nextDepth = (store.get(key) ?? 1) - 1;
        if (nextDepth <= 0) {
          store.delete(key);
        } else {
          store.set(key, nextDepth);
        }
      }
    }

    const previous = locks.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chain = previous.then(() => current);
    locks.set(key, chain);

    await previous;

    const activeStore = store ?? new Map<string, number>();
    activeStore.set(key, 1);

    const runWork = async (): Promise<T> => {
      try {
        return await work();
      } finally {
        const nextDepth = (activeStore.get(key) ?? 1) - 1;
        if (nextDepth <= 0) {
          activeStore.delete(key);
        } else {
          activeStore.set(key, nextDepth);
        }
      }
    };

    try {
      return store ? await runWork() : await context.run(activeStore, runWork);
    } finally {
      release?.();
      void chain.finally(() => {
        if (locks.get(key) === chain) {
          locks.delete(key);
        }
      });
    }
  }

  function reset(): void {
    locks.clear();
  }

  return { withLock, reset };
}
