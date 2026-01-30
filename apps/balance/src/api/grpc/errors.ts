import * as grpc from '@grpc/grpc-js';
import {
  asGrpcServiceError,
  createGrpcServiceError,
  isGrpcServiceErrorLike,
} from '@specify-poker/shared';
import { InvalidArgumentError } from './validation';

export function toGrpcServiceError(error: unknown): grpc.ServiceError {
  if (error instanceof InvalidArgumentError) {
    return createGrpcServiceError(
      grpc.status.INVALID_ARGUMENT,
      error.message,
      error,
    ) as grpc.ServiceError;
  }

  if (isGrpcServiceErrorLike(error)) {
    return asGrpcServiceError(error, {
      code: grpc.status.INTERNAL,
      message: 'Unknown error',
    }) as grpc.ServiceError;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return createGrpcServiceError(grpc.status.INTERNAL, message, error) as grpc.ServiceError;
}

export function shouldLogGrpcError(error: unknown): boolean {
  return !(error instanceof InvalidArgumentError) && !isGrpcServiceErrorLike(error);
}
