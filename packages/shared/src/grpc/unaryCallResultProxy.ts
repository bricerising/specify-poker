import { err } from "../result";
import { unaryCallResult, type UnaryCallOptions, type UnaryCallResult, type UnaryClientMethod } from "./call";
import { createUnaryClientProxy } from "./unaryClientProxy";

type ResultUnaryMethod<TMethod> = TMethod extends UnaryClientMethod<infer Request, infer Response, infer _CallbackError>
  ? (request: Request, options?: UnaryCallOptions) => Promise<UnaryCallResult<Response>>
  : never;

export type UnaryCallResultProxy<TClient extends object> = {
  [K in keyof TClient]: ResultUnaryMethod<TClient[K]>;
};

export function createUnaryCallResultProxy<TClient extends object>(client: TClient): UnaryCallResultProxy<TClient> {
  return createUnaryClientProxy<UnaryCallResultProxy<TClient>, Promise<UnaryCallResult<unknown>>>({
    client,
    call: (method, request, options) => unaryCallResult(method, request, options),
    onNonFunctionProperty: (prop) =>
      Promise.resolve(err(new Error(`unary_call_result_proxy.non_function_property:${String(prop)}`))),
  });
}
