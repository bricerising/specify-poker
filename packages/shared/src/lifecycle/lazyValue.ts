export type LazyValue<T> = {
  get(): T;
  peek(): T | undefined;
  reset(): void;
};

export function createLazyValue<T>(create: () => T): LazyValue<T> {
  type State = { type: 'empty' } | { type: 'filled'; value: T };
  let state: State = { type: 'empty' };

  return {
    get: () => {
      if (state.type === 'filled') {
        return state.value;
      }

      const value = create();
      state = { type: 'filled', value };
      return value;
    },
    peek: () => (state.type === 'filled' ? state.value : undefined),
    reset: () => {
      state = { type: 'empty' };
    },
  };
}
