/**
 * Standardized HTTP error response utilities.
 *
 * Provides consistent error response format across all HTTP endpoints:
 * { code: string, message: string, traceId?: string, details?: object }
 *
 * @example
 * ```ts
 * import { createErrorResponse, ErrorCodes } from '@specify-poker/shared';
 *
 * res.status(400).json(createErrorResponse({
 *   code: ErrorCodes.VALIDATION_ERROR,
 *   message: 'Invalid request body',
 *   traceId: getActiveTraceId(),
 * }));
 * ```
 */

/**
 * Standard error codes for HTTP responses.
 */
export const ErrorCodes = {
  /** Request validation failed (400) */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Resource not found (404) */
  NOT_FOUND: 'NOT_FOUND',
  /** Authentication required (401) */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Permission denied (403) */
  FORBIDDEN: 'FORBIDDEN',
  /** Rate limit exceeded (429) */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Service temporarily unavailable (503) */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /** Internal server error (500) */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Circuit breaker is open (503) */
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  /** Request timed out (504) */
  TIMEOUT: 'TIMEOUT',
  /** Conflict with current state (409) */
  CONFLICT: 'CONFLICT',
  /** Resource already exists (409) */
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  /** Request was rejected due to concurrency limits (503) */
  BULKHEAD_REJECTED: 'BULKHEAD_REJECTED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Standardized error response structure.
 */
export type StandardErrorResponse = {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Trace ID for correlation with backend logs (optional) */
  traceId?: string;
  /** Additional error details (optional) */
  details?: Record<string, unknown>;
};

/**
 * Options for creating an error response.
 */
export type ErrorResponseOptions = {
  code: string;
  message: string;
  traceId?: string;
  details?: Record<string, unknown>;
};

/**
 * Creates a standardized error response object.
 *
 * @param options - Error response options
 * @returns Standardized error response
 */
export function createErrorResponse(options: ErrorResponseOptions): StandardErrorResponse {
  const response: StandardErrorResponse = {
    code: options.code,
    message: options.message,
  };

  if (options.traceId) {
    response.traceId = options.traceId;
  }

  if (options.details && Object.keys(options.details).length > 0) {
    response.details = options.details;
  }

  return response;
}

/**
 * Maps an error code to HTTP status code.
 */
export function errorCodeToHttpStatus(code: string): number {
  switch (code) {
    case ErrorCodes.VALIDATION_ERROR:
      return 400;
    case ErrorCodes.UNAUTHORIZED:
      return 401;
    case ErrorCodes.FORBIDDEN:
      return 403;
    case ErrorCodes.NOT_FOUND:
      return 404;
    case ErrorCodes.CONFLICT:
    case ErrorCodes.ALREADY_EXISTS:
      return 409;
    case ErrorCodes.RATE_LIMITED:
      return 429;
    case ErrorCodes.INTERNAL_ERROR:
      return 500;
    case ErrorCodes.SERVICE_UNAVAILABLE:
    case ErrorCodes.CIRCUIT_OPEN:
    case ErrorCodes.BULKHEAD_REJECTED:
      return 503;
    case ErrorCodes.TIMEOUT:
      return 504;
    default:
      return 500;
  }
}

/**
 * Type guard to check if a value is a StandardErrorResponse.
 */
export function isStandardErrorResponse(value: unknown): value is StandardErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as StandardErrorResponse).code === 'string' &&
    typeof (value as StandardErrorResponse).message === 'string'
  );
}
