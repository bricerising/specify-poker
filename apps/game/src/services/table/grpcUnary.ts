export type UnaryCallback<TResponse> = (err: Error | null, response: TResponse) => void;

export { unaryCall, unaryCallResult } from "@specify-poker/shared";
