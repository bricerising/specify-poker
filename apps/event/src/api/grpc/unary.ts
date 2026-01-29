import type * as grpc from '@grpc/grpc-js';
import { createUnaryHandler, withUnaryTiming } from '@specify-poker/shared';
import { recordGrpcRequest } from '../../observability/metrics';
import { toServiceError } from './grpcErrors';

export type UnaryHandler<Req, Res> = (
  request: Req,
  call: grpc.ServerUnaryCall<Req, Res>,
) => Promise<Res>;

export function unary<Req, Res>(
  method: string,
  handler: UnaryHandler<Req, Res>,
): grpc.handleUnaryCall<Req, Res> {
  return createUnaryHandler<Req, Res, grpc.ServerUnaryCall<Req, Res>, grpc.ServiceError>({
    handler: ({ request, call }) => handler(request, call),
    interceptors: [withUnaryTiming({ method, record: recordGrpcRequest })],
    toCallbackError: toServiceError,
  });
}
