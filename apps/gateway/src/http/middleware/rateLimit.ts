import type { Request, Response, NextFunction } from 'express';
import { incrementRateLimit } from '../../storage/rateLimitStore';
import logger from '../../observability/logger';
import {
  readIntEnv,
  readStringEnv,
  createErrorResponse,
  createRateLimitHeaders,
  ErrorCodes,
  getActiveTraceId,
} from '@specify-poker/shared';

const HTTP_WINDOW_MS = readIntEnv(process.env, 'HTTP_RATE_LIMIT_WINDOW_MS', 60_000, { min: 1 });
const HTTP_MAX = readIntEnv(process.env, 'HTTP_RATE_LIMIT_MAX', 100, { min: 1 });
const HTTP_FAIL_OPEN = parseBoolean(
  readStringEnv(process.env, 'HTTP_RATE_LIMIT_FAIL_OPEN', 'true'),
  true,
);

function parseBoolean(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

/**
 * Calculates the reset time for the current rate limit window.
 */
function getResetTime(): number {
  // Round up to next window boundary
  const now = Date.now();
  return now + HTTP_WINDOW_MS - (now % HTTP_WINDOW_MS);
}

/**
 * Sets rate limit headers on the response.
 */
function setRateLimitHeaders(res: Response, count: number, isLimited: boolean): void {
  const remaining = Math.max(0, HTTP_MAX - count);
  const headers = createRateLimitHeaders(
    {
      limit: HTTP_MAX,
      remaining,
      resetMs: getResetTime(),
    },
    isLimited,
  );

  res.set(headers);
}

/**
 * Sends a rate limited response with proper headers and format.
 */
function sendRateLimitedResponse(res: Response, count: number, message: string): void {
  setRateLimitHeaders(res, count, true);
  res.status(429).json(
    createErrorResponse({
      code: ErrorCodes.RATE_LIMITED,
      message,
      traceId: getActiveTraceId(),
    }),
  );
}

/**
 * Sends a service unavailable response (rate limiter down).
 */
function sendUnavailableResponse(res: Response): void {
  res.status(503).json(
    createErrorResponse({
      code: ErrorCodes.SERVICE_UNAVAILABLE,
      message: 'Rate limiting service unavailable',
      traceId: getActiveTraceId(),
    }),
  );
}

export async function httpRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userId = req.auth?.userId ?? 'anonymous';

  // Per IP and Per User limits
  const ipKey = `ratelimit:http:ip:${ip}`;
  const userKey = `ratelimit:http:user:${userId}`;

  try {
    const ipCount = await incrementRateLimit(ipKey, HTTP_WINDOW_MS);
    if (ipCount === null) {
      if (HTTP_FAIL_OPEN) {
        return next();
      }
      return sendUnavailableResponse(res);
    }

    if (ipCount > HTTP_MAX) {
      return sendRateLimitedResponse(res, ipCount, 'Too many requests from this IP');
    }

    // Track the highest count for headers
    let effectiveCount = ipCount;

    if (userId !== 'anonymous') {
      const userCount = await incrementRateLimit(userKey, HTTP_WINDOW_MS);
      if (userCount === null) {
        if (HTTP_FAIL_OPEN) {
          // Still set headers for IP limit
          setRateLimitHeaders(res, ipCount, false);
          return next();
        }
        return sendUnavailableResponse(res);
      }

      if (userCount > HTTP_MAX) {
        return sendRateLimitedResponse(res, userCount, 'Too many requests from this user');
      }

      // Use the higher of the two counts for remaining calculation
      effectiveCount = Math.max(ipCount, userCount);
    }

    // Set rate limit headers for successful requests
    setRateLimitHeaders(res, effectiveCount, false);
    return next();
  } catch (err) {
    logger.error({ err, ip, userId }, 'Rate limit middleware error');
    if (HTTP_FAIL_OPEN) {
      return next();
    }
    return sendUnavailableResponse(res);
  }
}
