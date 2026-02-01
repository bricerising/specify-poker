/**
 * Retry executor that integrates with RetryStrategy and CircuitBreaker.
 *
 * Retries only on transient errors (network issues, temporary unavailability).
 * Does NOT retry on client errors (invalid arguments, authentication failures).
 *
 * @example
 * ```ts
 * const executor = createRetryExecutor({
 *   strategy: withJitter(exponentialBackoff({ maxAttempts: 3 })),
 *   isRetryable: isTransientGrpcError,
 *   circuitBreaker: cb,
 * });
 *
 * const result = await executor.execute(() => grpcClient.call(request));
 * ```
 */

import type { RetryStrategy } from '../retry';
import type { CircuitBreaker } from './circuitBreaker';
import { isCircuitBreakerOpenError } from './circuitBreaker';

/**
 * gRPC status codes that are considered transient (safe to retry).
 *
 * @see https://grpc.io/docs/guides/status-codes/
 */
export const TRANSIENT_GRPC_CODES: ReadonlySet<number> = new Set([
  4, // DEADLINE_EXCEEDED - The operation timed out
  8, // RESOURCE_EXHAUSTED - Rate limiting or resource limits
  13, // INTERNAL - Server-side error (may be transient)
  14, // UNAVAILABLE - Service temporarily unavailable
]);

/**
 * gRPC status codes that should NOT be retried (client errors, permanent failures).
 */
export const NON_RETRYABLE_GRPC_CODES: ReadonlySet<number> = new Set([
  1, // CANCELLED - Operation was cancelled
  2, // UNKNOWN - Unknown error (could go either way, default to no retry)
  3, // INVALID_ARGUMENT - Client error
  5, // NOT_FOUND - Resource doesn't exist
  6, // ALREADY_EXISTS - Resource already exists
  7, // PERMISSION_DENIED - No permission
  9, // FAILED_PRECONDITION - Precondition failed
  10, // ABORTED - Operation aborted (conflicts)
  11, // OUT_OF_RANGE - Value out of range
  12, // UNIMPLEMENTED - Method not implemented
  15, // DATA_LOSS - Unrecoverable data loss
  16, // UNAUTHENTICATED - Not authenticated
]);

export type RetryableErrorPredicate = (error: unknown) => boolean;

export type RetryExecutorConfig = {
  /** The retry strategy to use for delay calculation */
  strategy: RetryStrategy;
  /** Predicate to determine if an error is retryable */
  isRetryable: RetryableErrorPredicate;
  /** Optional circuit breaker - skips retry if circuit is OPEN */
  circuitBreaker?: CircuitBreaker;
  /** Callback for each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
};

export type RetryExecutor = {
  /** Execute a call with retry logic */
  execute<T>(call: () => Promise<T>): Promise<T>;
};

/**
 * Extracts gRPC status code from an error.
 * Works with standard gRPC error format.
 */
function getGrpcStatusCode(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object') {
    return undefined;
  }

  // Standard gRPC error format
  if ('code' in error && typeof (error as { code: unknown }).code === 'number') {
    return (error as { code: number }).code;
  }

  return undefined;
}

/**
 * Default predicate for determining if a gRPC error is transient.
 * Only considers Error instances to avoid false positives from plain objects.
 */
export function isTransientGrpcError(error: unknown): boolean {
  // Must be an Error instance
  if (!(error instanceof Error)) {
    return false;
  }

  // Never retry circuit breaker open errors
  if (isCircuitBreakerOpenError(error)) {
    return false;
  }

  const code = getGrpcStatusCode(error);
  if (code === undefined) {
    // Check for common transient error patterns in message
    const message = error.message.toLowerCase();
    return (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('unavailable') ||
      message.includes('deadline exceeded')
    );
  }

  return TRANSIENT_GRPC_CODES.has(code);
}

/**
 * Delays execution for the specified duration.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a retry executor with the specified configuration.
 *
 * @param config - Retry executor configuration
 */
export function createRetryExecutor(config: RetryExecutorConfig): RetryExecutor {
  const { strategy, isRetryable, circuitBreaker, onRetry } = config;

  const execute = async <T>(call: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        // Don't retry if error is not retryable
        if (!isRetryable(error)) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (!strategy.shouldRetry(attempt)) {
          throw error;
        }

        // Don't retry if circuit is now open
        if (circuitBreaker && circuitBreaker.getState() === 'OPEN') {
          throw error;
        }

        // Calculate delay and wait
        const delayMs = strategy.getDelayMs(attempt);
        onRetry?.(attempt, error, delayMs);
        await delay(delayMs);
      }
    }
  };

  return { execute };
}

/**
 * Creates a simple retry executor with exponential backoff for gRPC calls.
 * Convenience function with sensible defaults.
 */
export function createGrpcRetryExecutor(options?: {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  circuitBreaker?: CircuitBreaker;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}): RetryExecutor {
  const {
    maxAttempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    circuitBreaker,
    onRetry,
  } = options ?? {};

  // Import dynamically to avoid circular dependency
  const strategy: RetryStrategy = {
    getDelayMs: (attempt) => {
      const base = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(base, maxDelayMs);
      // Add jitter: ±20%
      const jitter = capped * 0.2 * (Math.random() * 2 - 1);
      return Math.max(0, Math.round(capped + jitter));
    },
    shouldRetry: (attempt) => attempt < maxAttempts,
  };

  return createRetryExecutor({
    strategy,
    isRetryable: isTransientGrpcError,
    circuitBreaker,
    onRetry,
  });
}
