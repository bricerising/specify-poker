export interface KeyedLock {
  withLock<T>(key: string, work: () => Promise<T>): Promise<T>;
  reset(): void;
}

export function createKeyedLock(): KeyedLock {
  const locks = new Map<string, Promise<void>>();

  async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chain = previous.then(() => current);
    locks.set(key, chain);

    await previous;
    try {
      return await work();
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

