import { unaryCallResult, type UnaryCallOptions, type UnaryCallResult } from "./call";
import { createNonThenableProxy } from "../proxy/nonThenableProxy";

type UnaryCallback<Response, CallbackError extends Error = Error> = (
  error: CallbackError | null,
  response: Response,
) => void;

type UnaryMethod<Request, Response, CallbackError extends Error = Error> = (
  request: Request,
  callback: UnaryCallback<Response, CallbackError>,
) => unknown;

type ResultUnaryMethod<TMethod> = TMethod extends UnaryMethod<infer Request, infer Response, infer _CallbackError>
  ? (request: Request, options?: UnaryCallOptions) => Promise<UnaryCallResult<Response>>
  : never;

export type UnaryCallResultProxy<TClient extends object> = {
  [K in keyof TClient]: ResultUnaryMethod<TClient[K]>;
};

export function createUnaryCallResultProxy<TClient extends object>(client: TClient): UnaryCallResultProxy<TClient> {
  return createNonThenableProxy((prop) => {
    return (request: unknown, options?: UnaryCallOptions) => {
      const value = (client as Record<PropertyKey, unknown>)[prop];
      if (typeof value !== "function") {
        return Promise.resolve({
          ok: false,
          error: new Error(`unary_call_result_proxy.non_function_property:${String(prop)}`),
        });
      }

      const method = value as UnaryMethod<unknown, unknown>;
      return unaryCallResult(
        (nextRequest, callback) => method.call(client, nextRequest, callback),
        request,
        options,
      );
    };
  });
}
