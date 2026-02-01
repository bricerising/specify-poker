import * as grpc from '@grpc/grpc-js';
import {
  asGrpcServiceError,
  createGrpcServiceError,
  ensureError,
  isGrpcServiceErrorLike,
} from '@specify-poker/shared';

const messageToStatus: Partial<Record<string, grpc.status>> = {
  TABLE_NOT_FOUND: grpc.status.NOT_FOUND,
  NOT_AUTHORIZED: grpc.status.PERMISSION_DENIED,
  MISSING_IDEMPOTENCY_KEY: grpc.status.INVALID_ARGUMENT,
  IDEMPOTENCY_IN_PROGRESS: grpc.status.UNAVAILABLE,
};

export function toServiceError(error: unknown): grpc.ServiceError {
  if (isGrpcServiceErrorLike(error)) {
    return asGrpcServiceError(error, {
      code: grpc.status.INTERNAL,
      message: 'INTERNAL',
    }) as grpc.ServiceError;
  }

  const baseError = ensureError(error, 'INTERNAL');
  const message = baseError.message || 'INTERNAL';
  const code = messageToStatus[message] ?? grpc.status.INTERNAL;

  return createGrpcServiceError(code, message, error) as grpc.ServiceError;
}
