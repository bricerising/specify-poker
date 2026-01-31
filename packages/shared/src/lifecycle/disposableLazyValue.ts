import { createLazyValue, type LazyValue } from './lazyValue';

export type DisposableLazyValue<T> = LazyValue<T> & {
  dispose(): void;
};

/**
 * Decorator around {@link createLazyValue} that adds a best-effort disposal step
 * for the currently-cached value.
 *
 * Useful for resources that need explicit cleanup (e.g. gRPC clients) while still
 * benefiting from lazy initialization.
 */
export function createDisposableLazyValue<T>(
  create: () => T,
  disposeValue: (value: T) => void,
): DisposableLazyValue<T> {
  const lazy = createLazyValue(create);

  return {
    ...lazy,
    dispose: () => {
      const value = lazy.peek();
      if (value === undefined) {
        lazy.reset();
        return;
      }

      try {
        disposeValue(value);
      } finally {
        lazy.reset();
      }
    },
  };
}
