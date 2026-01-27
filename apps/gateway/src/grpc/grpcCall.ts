import { unaryCall } from "@specify-poker/shared";

type UnaryCallback<T> = (err: Error | null, response: T) => void;

export function grpcCall<TRequest, TResponse>(
  method: (request: TRequest, callback: UnaryCallback<TResponse>) => unknown,
  request: TRequest,
): Promise<TResponse> {
  return unaryCall(method, request);
}
