/**
 * HTTP utilities for standardized error responses and observability.
 *
 * @example
 * ```ts
 * import {
 *   createErrorResponse,
 *   ErrorCodes,
 *   getActiveTraceId,
 *   createRateLimitHeaders,
 * } from '@specify-poker/shared';
 *
 * // Standardized error response
 * res.status(400).json(createErrorResponse({
 *   code: ErrorCodes.VALIDATION_ERROR,
 *   message: 'Invalid input',
 *   traceId: getActiveTraceId(),
 * }));
 *
 * // Rate limit headers
 * res.set(createRateLimitHeaders({
 *   limit: 100,
 *   remaining: 50,
 *   resetMs: Date.now() + 60000,
 * }));
 * ```
 */

export {
  createErrorResponse,
  errorCodeToHttpStatus,
  isStandardErrorResponse,
  ErrorCodes,
  type ErrorCode,
  type StandardErrorResponse,
  type ErrorResponseOptions,
} from './errorResponse';

export {
  getActiveTraceId,
  getActiveSpanId,
  getTraceId,
  parseTraceparentHeader,
  resetOtelApiCache,
} from './traceContext';

export {
  createRateLimitHeaders,
  parseRateLimitHeaders,
  type RateLimitInfo,
  type RateLimitHeaders,
} from './rateLimitHeaders';
