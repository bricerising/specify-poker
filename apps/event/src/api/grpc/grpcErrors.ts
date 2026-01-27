import * as grpc from "@grpc/grpc-js";
import { getErrorMessage, InvalidArgumentError, NotFoundError, PermissionDeniedError } from "../../errors";
import logger from "../../observability/logger";

function isGrpcServiceError(error: unknown): error is grpc.ServiceError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "number"
  );
}

function createServiceError(code: grpc.status, message: string, cause?: unknown): grpc.ServiceError {
  const baseError = new Error(message, cause ? { cause } : undefined);
  return Object.assign(baseError, { code, details: message }) as grpc.ServiceError;
}

export function toServiceError(error: unknown): grpc.ServiceError {
  if (isGrpcServiceError(error)) {
    return error;
  }

  const message = getErrorMessage(error);

  if (error instanceof InvalidArgumentError) {
    return createServiceError(grpc.status.INVALID_ARGUMENT, message, error);
  }
  if (error instanceof NotFoundError) {
    return createServiceError(grpc.status.NOT_FOUND, message, error);
  }
  if (error instanceof PermissionDeniedError) {
    return createServiceError(grpc.status.PERMISSION_DENIED, message, error);
  }

  logger.error({ error }, "Unhandled gRPC handler error");
  return createServiceError(grpc.status.INTERNAL, message, error);
}
