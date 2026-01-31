import { requireFunctionProperty } from './functionProperty';
import { createNonThenableProxy } from './nonThenableProxy';

/**
 * Creates a Proxy that exposes async methods which delegate to an async-resolved target.
 *
 * Useful for lazily-loaded services/clients where:
 * - the *target* is created/loaded asynchronously
 * - callers want a stable reference they can call immediately
 */
export function createAsyncMethodProxy<T extends object>(getTarget: () => Promise<T>): T {
  const cachedWrappers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  const getOrCreateWrapper = (prop: string) => {
    const cached = cachedWrappers.get(prop);
    if (cached) {
      return cached;
    }

    const wrapper = (...args: unknown[]) =>
      getTarget().then((target) => {
        const value = requireFunctionProperty(
          target,
          prop,
          'async_method_proxy.non_function_property',
        );
        return value.apply(target, args);
      });

    cachedWrappers.set(prop, wrapper);
    return wrapper;
  };

  return createNonThenableProxy((prop) => getOrCreateWrapper(prop));
}

