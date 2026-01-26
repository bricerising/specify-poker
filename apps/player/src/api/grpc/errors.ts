import { status } from "@grpc/grpc-js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../domain/errors";

export type GrpcServiceError = Error & { code: number };

function isGrpcServiceError(error: unknown): error is GrpcServiceError {
  return error instanceof Error && typeof (error as GrpcServiceError).code === "number";
}

function createGrpcServiceError(code: number, message: string, cause?: unknown): GrpcServiceError {
  const error = new Error(message, cause ? { cause } : undefined) as GrpcServiceError;
  error.code = code;
  return error;
}

export function toGrpcServiceError(error: unknown): GrpcServiceError {
  if (isGrpcServiceError(error)) {
    return error;
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

  return createGrpcServiceError(status.INTERNAL, "Internal server error", error);
}
