import { status } from '@grpc/grpc-js';
import {
  asGrpcServiceError,
  createGrpcServiceError,
  isGrpcServiceErrorLike,
  type GrpcServiceError,
} from '@specify-poker/shared';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type UpdateProfileError,
  type AddFriendError,
} from '../../domain/errors';

export function toGrpcServiceError(error: unknown): GrpcServiceError {
  if (isGrpcServiceErrorLike(error)) {
    return asGrpcServiceError(error, { code: status.INTERNAL, message: 'Internal server error' });
  }

  if (error instanceof ValidationError) {
    return createGrpcServiceError(status.INVALID_ARGUMENT, error.message, error);
  }

  if (error instanceof ConflictError) {
    return createGrpcServiceError(status.ALREADY_EXISTS, error.message, error);
  }

  if (error instanceof NotFoundError) {
    return createGrpcServiceError(status.NOT_FOUND, error.message, error);
  }

  if (error instanceof AppError) {
    return createGrpcServiceError(status.FAILED_PRECONDITION, error.message, error);
  }

  return createGrpcServiceError(status.INTERNAL, 'Internal server error', error);
}

/** Convert UpdateProfileError to gRPC service error */
export function updateProfileErrorToGrpc(error: UpdateProfileError): GrpcServiceError {
  switch (error.type) {
    case 'NotFound':
      return createGrpcServiceError(status.NOT_FOUND, 'Profile not found');
    case 'NicknameConflict':
      return createGrpcServiceError(status.ALREADY_EXISTS, 'Nickname is not available');
    case 'InvalidAvatarUrl':
      return createGrpcServiceError(status.INVALID_ARGUMENT, 'Avatar URL is invalid');
  }
}

/** Convert AddFriendError to gRPC service error */
export function addFriendErrorToGrpc(error: AddFriendError): GrpcServiceError {
  switch (error.type) {
    case 'CannotAddSelf':
      return createGrpcServiceError(status.INVALID_ARGUMENT, 'Cannot add yourself as a friend');
  }
}
