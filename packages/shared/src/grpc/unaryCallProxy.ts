import { unaryCall, type UnaryCallOptions, type UnaryClientMethod } from "./call";
import { createUnaryClientProxy } from "./unaryClientProxy";

type PromisifiedUnaryMethod<TMethod> = TMethod extends UnaryClientMethod<
  infer Request,
  infer Response,
  infer _CallbackError
>
  ? (request: Request, options?: UnaryCallOptions) => Promise<Response>
  : never;

export type UnaryCallProxy<TClient extends object> = {
  [K in keyof TClient]: PromisifiedUnaryMethod<TClient[K]>;
};

export function createUnaryCallProxy<TClient extends object>(client: TClient): UnaryCallProxy<TClient> {
  return createUnaryClientProxy<UnaryCallProxy<TClient>, Promise<unknown>>({
    client,
    call: (method, request, options) => unaryCall(method, request, options),
    onNonFunctionProperty: (prop) =>
      Promise.reject(new Error(`unary_call_proxy.non_function_property:${String(prop)}`)),
  });
}
