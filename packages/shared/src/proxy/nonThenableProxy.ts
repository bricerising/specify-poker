type PropertyFactory = (prop: string) => unknown;

/**
 * Creates a Proxy that delegates property reads to `createProperty`, while ensuring
 * the resulting object is not treated as a Promise/thenable.
 *
 * This is useful when using Proxies to adapt APIs (e.g. callback-based clients to Promises),
 * because awaiting a thenable proxy can produce very surprising behavior.
 */
export function createNonThenableProxy<T extends object>(createProperty: PropertyFactory): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol') {
          return undefined;
        }

        if (prop === 'then') {
          return undefined;
        }

        return createProperty(prop);
      },
    },
  ) as unknown as T;
}
