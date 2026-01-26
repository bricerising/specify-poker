import * as grpc from "@grpc/grpc-js";
import { toServiceError } from "./grpcErrors";

export type UnaryHandler<Req, Res> = (request: Req, call: grpc.ServerUnaryCall<Req, Res>) => Promise<Res>;

export function unary<Req, Res>(handler: UnaryHandler<Req, Res>): grpc.handleUnaryCall<Req, Res> {
  return async (call, callback) => {
    try {
      const response = await handler(call.request, call);
      callback(null, response);
    } catch (error: unknown) {
      callback(toServiceError(error));
    }
  };
}

