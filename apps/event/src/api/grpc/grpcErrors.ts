import * as grpc from '@grpc/grpc-js';
import {
  asGrpcServiceError,
  createGrpcServiceError,
  isGrpcServiceErrorLike,
} from '@specify-poker/shared';
import {
  getErrorMessage,
  InvalidArgumentError,
  NotFoundError,
  PermissionDeniedError,
} from '../../errors';
import logger from '../../observability/logger';

export function toServiceError(error: unknown): grpc.ServiceError {
  if (isGrpcServiceErrorLike(error)) {
    return asGrpcServiceError(error, {
      code: grpc.status.INTERNAL,
      message: 'Unknown error',
    }) as grpc.ServiceError;
  }

  const message = getErrorMessage(error);

  if (error instanceof InvalidArgumentError) {
    return createGrpcServiceError(
      grpc.status.INVALID_ARGUMENT,
      message,
      error,
    ) as grpc.ServiceError;
  }
  if (error instanceof NotFoundError) {
    return createGrpcServiceError(grpc.status.NOT_FOUND, message, error) as grpc.ServiceError;
  }
  if (error instanceof PermissionDeniedError) {
    return createGrpcServiceError(
      grpc.status.PERMISSION_DENIED,
      message,
      error,
    ) as grpc.ServiceError;
  }

  logger.error({ error }, 'Unhandled gRPC handler error');
  return createGrpcServiceError(grpc.status.INTERNAL, message, error) as grpc.ServiceError;
}
