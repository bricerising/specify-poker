import { createNonThenableProxy } from "../proxy/nonThenableProxy";

export function createAsyncMethodProxy<T extends object>(getTarget: () => Promise<T>): T {
  return createNonThenableProxy((prop) => {
    return (...args: unknown[]) =>
      getTarget().then((target) => {
        const value = (target as Record<PropertyKey, unknown>)[prop];
        if (typeof value !== "function") {
          throw new Error(`async_method_proxy.non_function_property:${String(prop)}`);
        }
        return value.apply(target, args);
      });
  });
}
