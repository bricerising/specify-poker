import * as grpc from "@grpc/grpc-js";

const messageToStatus: Partial<Record<string, grpc.status>> = {
  TABLE_NOT_FOUND: grpc.status.NOT_FOUND,
  NOT_AUTHORIZED: grpc.status.PERMISSION_DENIED,
};

function isGrpcServiceError(error: unknown): error is grpc.ServiceError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "number"
  );
}

export function toServiceError(error: unknown): grpc.ServiceError {
  if (isGrpcServiceError(error)) {
    return error;
  }

  const baseError = error instanceof Error ? error : new Error("INTERNAL");
  const message = baseError.message || "INTERNAL";
  const code = messageToStatus[message] ?? grpc.status.INTERNAL;

  return Object.assign(baseError, { code, details: message }) as grpc.ServiceError;
}
