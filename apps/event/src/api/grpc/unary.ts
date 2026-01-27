import type * as grpc from "@grpc/grpc-js";
import { createUnaryHandler } from "@specify-poker/shared";
import { toServiceError } from "./grpcErrors";

export type UnaryHandler<Req, Res> = (request: Req, call: grpc.ServerUnaryCall<Req, Res>) => Promise<Res>;

export function unary<Req, Res>(handler: UnaryHandler<Req, Res>): grpc.handleUnaryCall<Req, Res> {
  return createUnaryHandler<Req, Res, grpc.ServerUnaryCall<Req, Res>, grpc.ServiceError>({
    handler: ({ request, call }) => handler(request, call),
    toCallbackError: toServiceError,
  });
}
