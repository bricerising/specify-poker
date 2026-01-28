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

  return createNonThenableProxy<TProxy>((prop) => {
    return (request: unknown, callOptions?: UnaryCallOptions) => {
      const value = getFunctionProperty(client, prop);
      if (!value) {
        return options.onNonFunctionProperty(prop);
      }

      const method = value as AnyUnaryClientMethod;
      return options.call(
        (nextRequest, callback) => method.call(client, nextRequest, callback),
        request,
        callOptions,
      );
    };
  });
}
