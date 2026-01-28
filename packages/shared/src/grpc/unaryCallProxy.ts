import { unaryCall, type UnaryCallOptions } from "./call";
import { createNonThenableProxy } from "../proxy/nonThenableProxy";

type UnaryCallback<Response, CallbackError extends Error = Error> = (
  error: CallbackError | null,
  response: Response,
) => void;

type UnaryMethod<Request, Response, CallbackError extends Error = Error> = (
  request: Request,
  callback: UnaryCallback<Response, CallbackError>,
) => unknown;

type PromisifiedUnaryMethod<TMethod> = TMethod extends UnaryMethod<infer Request, infer Response, infer _CallbackError>
  ? (request: Request, options?: UnaryCallOptions) => Promise<Response>
  : never;

export type UnaryCallProxy<TClient extends object> = {
  [K in keyof TClient]: PromisifiedUnaryMethod<TClient[K]>;
};

export function createUnaryCallProxy<TClient extends object>(client: TClient): UnaryCallProxy<TClient> {
  return createNonThenableProxy((prop) => {
    return (request: unknown, options?: UnaryCallOptions) => {
      const value = (client as Record<PropertyKey, unknown>)[prop];
      if (typeof value !== "function") {
        return Promise.reject(new Error(`unary_call_proxy.non_function_property:${String(prop)}`));
      }

      const method = value as UnaryMethod<unknown, unknown>;
      return unaryCall((nextRequest, callback) => method.call(client, nextRequest, callback), request, options);
    };
  });
}
