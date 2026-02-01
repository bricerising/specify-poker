/**
 * Rate limit header utilities.
 *
 * Creates standard rate limit headers (X-RateLimit-*) for HTTP responses.
 *
 * @example
 * ```ts
 * import { createRateLimitHeaders } from '@specify-poker/shared';
 *
 * const headers = createRateLimitHeaders({
 *   limit: 100,
 *   remaining: 95,
 *   resetMs: Date.now() + 60000,
 * });
 *
 * res.set(headers);
 * ```
 */

/**
 * Rate limit information.
 */
export type RateLimitInfo = {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Unix timestamp in milliseconds when the limit resets */
  resetMs: number;
};

/**
 * Standard rate limit headers.
 */
export type RateLimitHeaders = {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'Retry-After'?: string;
};

/**
 * Creates rate limit headers for an HTTP response.
 *
 * Headers follow the draft RFC standard:
 * - X-RateLimit-Limit: Maximum requests per window
 * - X-RateLimit-Remaining: Remaining requests in current window
 * - X-RateLimit-Reset: Unix timestamp (seconds) when limit resets
 * - Retry-After: Seconds until limit resets (only when rate limited)
 *
 * @param info - Rate limit information
 * @param isLimited - Whether the request was rate limited (adds Retry-After)
 * @returns Headers object to be merged into response
 */
export function createRateLimitHeaders(
  info: RateLimitInfo,
  isLimited?: boolean,
): RateLimitHeaders {
  const resetSeconds = Math.ceil(info.resetMs / 1000);
  const remaining = Math.max(0, info.remaining);

  const headers: RateLimitHeaders = {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetSeconds),
  };

  if (isLimited) {
    const retryAfterSeconds = Math.max(1, Math.ceil((info.resetMs - Date.now()) / 1000));
    headers['Retry-After'] = String(retryAfterSeconds);
  }

  return headers;
}

/**
 * Parses rate limit headers from a response.
 * Useful for client-side rate limit handling.
 *
 * @param headers - Headers object or Map
 * @returns Parsed rate limit info or undefined if headers are missing
 */
export function parseRateLimitHeaders(
  headers: Record<string, string | string[] | undefined> | Headers,
): RateLimitInfo | undefined {
  const getHeader = (name: string): string | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name) ?? undefined;
    }
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const limitStr = getHeader('X-RateLimit-Limit') ?? getHeader('x-ratelimit-limit');
  const remainingStr = getHeader('X-RateLimit-Remaining') ?? getHeader('x-ratelimit-remaining');
  const resetStr = getHeader('X-RateLimit-Reset') ?? getHeader('x-ratelimit-reset');

  if (!limitStr || !remainingStr || !resetStr) {
    return undefined;
  }

  const limit = parseInt(limitStr, 10);
  const remaining = parseInt(remainingStr, 10);
  const resetSeconds = parseInt(resetStr, 10);

  if (isNaN(limit) || isNaN(remaining) || isNaN(resetSeconds)) {
    return undefined;
  }

  return {
    limit,
    remaining,
    resetMs: resetSeconds * 1000,
  };
}
