import * as grpc from "@grpc/grpc-js";
import { getErrorMessage, InvalidArgumentError, NotFoundError, PermissionDeniedError } from "../../errors";
import logger from "../../observability/logger";

export function toServiceError(error: unknown): grpc.ServiceError {
  const message = getErrorMessage(error);

  if (error instanceof InvalidArgumentError) {
    return { code: grpc.status.INVALID_ARGUMENT, message } as grpc.ServiceError;
  }
  if (error instanceof NotFoundError) {
    return { code: grpc.status.NOT_FOUND, message } as grpc.ServiceError;
  }
  if (error instanceof PermissionDeniedError) {
    return { code: grpc.status.PERMISSION_DENIED, message } as grpc.ServiceError;
  }

  logger.error({ error }, "Unhandled gRPC handler error");
  return { code: grpc.status.INTERNAL, message } as grpc.ServiceError;
}

