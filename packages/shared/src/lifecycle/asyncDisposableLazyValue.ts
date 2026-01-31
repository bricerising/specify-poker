import { createLazyValue, type LazyValue } from './lazyValue';

export type AsyncDisposableLazyValue<T> = LazyValue<T> & {
  dispose(): Promise<void>;
};

/**
 * Decorator around {@link createLazyValue} that adds a best-effort async disposal step
 * for the currently-cached value.
 *
 * Useful for resources that need explicit async cleanup (e.g. Redis, DB pools) while still
 * benefiting from lazy initialization.
 */
export function createAsyncDisposableLazyValue<T>(
  create: () => T,
  disposeValue: (value: T) => Promise<void>,
): AsyncDisposableLazyValue<T> {
  const lazy = createLazyValue(create);
  let disposePromise: Promise<void> | null = null;

  const dispose = async (): Promise<void> => {
    if (disposePromise) {
      return disposePromise;
    }

    disposePromise = (async () => {
      const value = lazy.peek();
      if (value === undefined) {
        lazy.reset();
        return;
      }

      try {
        await disposeValue(value);
      } finally {
        lazy.reset();
      }
    })().finally(() => {
      disposePromise = null;
    });

    return disposePromise;
  };

  return { ...lazy, dispose };
}
