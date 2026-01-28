import { createNonThenableProxy } from '../proxy/nonThenableProxy';
import { requireFunctionProperty } from '../proxy/functionProperty';

export function createAsyncMethodProxy<T extends object>(getTarget: () => Promise<T>): T {
  return createNonThenableProxy((prop) => {
    return (...args: unknown[]) =>
      getTarget().then((target) => {
        const value = requireFunctionProperty(
          target,
          prop,
          'async_method_proxy.non_function_property',
        );
        return value.apply(target, args);
      });
  });
}
