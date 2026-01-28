import { createNonThenableProxy } from './nonThenableProxy';

/**
 * Proxy helper for lazily-created clients:
 * - reads are delegated to the latest target from `getTarget()`
 * - function properties are bound to the target to preserve `this`
 * - the proxy is explicitly non-thenable to avoid `await proxy` footguns
 */
export function createBoundTargetProxy<TTarget extends object>(getTarget: () => TTarget): TTarget {
  return createNonThenableProxy((prop) => {
    const target = getTarget();
    const value = (target as Record<string, unknown>)[prop];

    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(target);
    }

    return value;
  });
}
