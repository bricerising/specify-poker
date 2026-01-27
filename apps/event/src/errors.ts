export class InvalidArgumentError extends Error {
  override readonly name = "InvalidArgumentError";
}

export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}

export class PermissionDeniedError extends Error {
  override readonly name = "PermissionDeniedError";
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
