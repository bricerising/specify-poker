/**
 * Express error handler middleware that returns standardized error responses.
 *
 * Maps different error types to appropriate HTTP status codes and formats:
 * - CircuitBreakerOpenError → 503 CIRCUIT_OPEN
 * - BulkheadRejectedError → 503 BULKHEAD_REJECTED
 * - Timeout errors → 504 TIMEOUT
 * - Other errors → 500 INTERNAL_ERROR
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import {
  createErrorResponse,
  ErrorCodes,
  errorCodeToHttpStatus,
  getActiveTraceId,
  isCircuitBreakerOpenError,
  isBulkheadRejectedError,
  isTimeoutError,
} from '@specify-poker/shared';
import logger from '../../observability/logger';

/**
 * Maps an error to an error code.
 */
function mapErrorToCode(err: Error): string {
  if (isCircuitBreakerOpenError(err)) {
    return ErrorCodes.CIRCUIT_OPEN;
  }

  if (isBulkheadRejectedError(err)) {
    return ErrorCodes.BULKHEAD_REJECTED;
  }

  if (isTimeoutError(err)) {
    return ErrorCodes.TIMEOUT;
  }

  // Check for common error patterns
  const message = err.message.toLowerCase();

  if (message.includes('not found')) {
    return ErrorCodes.NOT_FOUND;
  }

  if (message.includes('unauthorized') || message.includes('unauthenticated')) {
    return ErrorCodes.UNAUTHORIZED;
  }

  if (message.includes('forbidden') || message.includes('permission denied')) {
    return ErrorCodes.FORBIDDEN;
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorCodes.VALIDATION_ERROR;
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return ErrorCodes.RATE_LIMITED;
  }

  if (message.includes('unavailable') || message.includes('service')) {
    return ErrorCodes.SERVICE_UNAVAILABLE;
  }

  return ErrorCodes.INTERNAL_ERROR;
}

/**
 * Gets a user-friendly message for an error.
 * Avoids exposing internal details in production.
 */
function getUserFriendlyMessage(err: Error, code: string): string {
  // For known error types, use descriptive messages
  switch (code) {
    case ErrorCodes.CIRCUIT_OPEN:
      return 'Service temporarily unavailable. Please try again later.';
    case ErrorCodes.BULKHEAD_REJECTED:
      return 'Too many concurrent requests. Please try again.';
    case ErrorCodes.TIMEOUT:
      return 'Request timed out. Please try again.';
    case ErrorCodes.SERVICE_UNAVAILABLE:
      return 'Service temporarily unavailable. Please try again later.';
    case ErrorCodes.RATE_LIMITED:
      return 'Too many requests. Please slow down.';
    case ErrorCodes.UNAUTHORIZED:
      return 'Authentication required.';
    case ErrorCodes.FORBIDDEN:
      return 'Permission denied.';
    case ErrorCodes.NOT_FOUND:
      return 'Resource not found.';
    case ErrorCodes.VALIDATION_ERROR:
      return err.message || 'Invalid request.';
    case ErrorCodes.INTERNAL_ERROR:
    default:
      // In production, hide internal error details
      return process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message;
  }
}

/**
 * Express error handler middleware.
 *
 * Should be registered as the last middleware in the chain.
 *
 * @example
 * ```ts
 * app.use(errorHandlerMiddleware);
 * ```
 */
export const errorHandlerMiddleware: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  const code = mapErrorToCode(err);
  const status = errorCodeToHttpStatus(code);
  const traceId = getActiveTraceId();

  // Log the error
  logger.error(
    {
      err,
      code,
      status,
      traceId,
      path: req.path,
      method: req.method,
    },
    'http.error',
  );

  // Don't send response if headers already sent
  if (res.headersSent) {
    return;
  }

  const response = createErrorResponse({
    code,
    message: getUserFriendlyMessage(err, code),
    traceId,
  });

  res.status(status).json(response);
};

/**
 * Creates a custom error handler with additional options.
 */
export function createErrorHandler(options?: {
  /** Include stack traces in development */
  includeStack?: boolean;
  /** Custom error mapper */
  mapError?: (err: Error) => { code: string; message: string };
}): ErrorRequestHandler {
  return (err: Error, req: Request, res: Response, next: NextFunction): void => {
    if (options?.mapError) {
      const mapped = options.mapError(err);
      const status = errorCodeToHttpStatus(mapped.code);
      const traceId = getActiveTraceId();

      logger.error({ err, code: mapped.code, status, traceId }, 'http.error');

      if (!res.headersSent) {
        const response = createErrorResponse({
          code: mapped.code,
          message: mapped.message,
          traceId,
          details: options.includeStack ? { stack: err.stack } : undefined,
        });
        res.status(status).json(response);
      }
      return;
    }

    // Fall back to default handler
    errorHandlerMiddleware(err, req, res, next);
  };
}
