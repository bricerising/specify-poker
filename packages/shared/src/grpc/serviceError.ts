import { ensureError } from '../errors/ensureError';

export type GrpcServiceError = Error & { code: number; details?: string };

export type GrpcServiceErrorLike = { code: number; message?: unknown; details?: unknown };

export function isGrpcServiceErrorLike(error: unknown): error is GrpcServiceErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'number'
  );
}

export function createGrpcServiceError(
  code: number,
  message: string,
  cause?: unknown,
): GrpcServiceError {
  const error = new Error(message, cause !== undefined ? { cause } : undefined) as GrpcServiceError;
  error.code = code;
  error.details = message;
  return error;
}

export function asGrpcServiceError(
  error: unknown,
  fallback: { code: number; message: string },
): GrpcServiceError {
  if (!isGrpcServiceErrorLike(error)) {
    const baseError = ensureError(error, fallback.message);
    return createGrpcServiceError(fallback.code, baseError.message || fallback.message, error);
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : fallback.message;

  const details =
    typeof (error as { details?: unknown }).details === 'string'
      ? (error as { details: string }).details
      : message;

  if (error instanceof Error) {
    return Object.assign(error, { details }) as GrpcServiceError;
  }

  const serviceError = new Error(message, { cause: error }) as GrpcServiceError;
  serviceError.code = error.code;
  serviceError.details = details;
  return serviceError;
}
