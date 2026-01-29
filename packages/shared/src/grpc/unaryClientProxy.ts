import { createNonThenableProxy } from '../proxy/nonThenableProxy';
import { getFunctionProperty } from '../proxy/functionProperty';
import type { UnaryCallOptions, UnaryClientMethod } from './call';

type AnyUnaryClientMethod = UnaryClientMethod<unknown, unknown>;

type CreateUnaryClientProxyOptions<TResult> = {
  client: object;
  call: (method: AnyUnaryClientMethod, request: unknown, options?: UnaryCallOptions) => TResult;
  onNonFunctionProperty: (prop: string) => TResult;
};

export function createUnaryClientProxy<TProxy extends object, TResult>(
  options: CreateUnaryClientProxyOptions<TResult>,
): TProxy {
  const client = options.client;
  const cachedWrappers = new Map<
    string,
    (request: unknown, callOptions?: UnaryCallOptions) => TResult
  >();

  const getOrCreateWrapper = (
    methodName: string,
  ): ((request: unknown, callOptions?: UnaryCallOptions) => TResult) => {
    const cached = cachedWrappers.get(methodName);
    if (cached) {
      return cached;
    }

    const wrapper = (request: unknown, callOptions?: UnaryCallOptions) => {
      const value = getFunctionProperty(client, methodName);
      if (!value) {
        return options.onNonFunctionProperty(methodName);
      }

      const method = value as AnyUnaryClientMethod;
      return options.call(
        (nextRequest, callback) => method.call(client, nextRequest, callback),
        request,
        callOptions,
      );
    };

    cachedWrappers.set(methodName, wrapper);
    return wrapper;
  };

  return createNonThenableProxy<TProxy>(getOrCreateWrapper);
}
