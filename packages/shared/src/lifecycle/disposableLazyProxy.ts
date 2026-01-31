import { createBoundTargetProxy } from '../proxy/boundTargetProxy';
import { createDisposableLazyValue, type DisposableLazyValue } from './disposableLazyValue';

export type DisposableLazyProxy<T extends object> = DisposableLazyValue<T> & {
  proxy: T;
};

/**
 * Convenience helper for lazily-created resources that:
 * - are accessed via a stable Proxy reference (`proxy`)
 * - require explicit cleanup (`dispose`)
 *
 * Common use cases: gRPC clients, HTTP clients, SDK clients.
 */
export function createDisposableLazyProxy<T extends object>(
  create: () => T,
  disposeValue: (value: T) => void,
): DisposableLazyProxy<T> {
  const lazy = createDisposableLazyValue(create, disposeValue);
  return { ...lazy, proxy: createBoundTargetProxy(lazy.get) };
}

