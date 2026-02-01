/**
 * Resilient call wrapper that composes multiple resilience patterns.
 *
 * Execution order: Bulkhead → Circuit Breaker → Retry → Timeout → Call
 *
 * This ordering ensures:
 * 1. Bulkhead limits concurrency first (prevents resource exhaustion)
 * 2. Circuit breaker fast-fails if service is known to be down
 * 3. Retry handles transient failures with backoff
 * 4. Timeout prevents hanging calls
 *
 * @example
 * ```ts
 * const resilientCall = createResilientCall({
 *   bulkhead: createBulkhead('service', { maxConcurrent: 10 }),
 *   circuitBreaker: createCircuitBreaker('service'),
 *   retryExecutor: createGrpcRetryExecutor({ maxAttempts: 3 }),
 *   timeoutMs: 5000,
 * });
 *
 * const result = await resilientCall(() => grpcClient.call(request));
 * ```
 */

import type { CircuitBreaker } from './circuitBreaker';
import type { RetryExecutor } from './retryExecutor';
import type { Bulkhead } from './bulkhead';

export type ResilientCallConfig = {
  /** Circuit breaker for fast-fail when service is down */
  circuitBreaker?: CircuitBreaker;
  /** Retry executor for transient failures */
  retryExecutor?: RetryExecutor;
  /** Bulkhead for concurrency limiting */
  bulkhead?: Bulkhead;
  /** Timeout in ms for individual call attempts */
  timeoutMs?: number;
};

export type ResilientCallError = Error & {
  name: 'ResilientCallTimeoutError';
  timeoutMs: number;
};

/**
 * Creates a timeout error.
 */
export function createTimeoutError(timeoutMs: number): ResilientCallError {
  const error = new Error(`Call timed out after ${timeoutMs}ms`) as ResilientCallError;
  error.name = 'ResilientCallTimeoutError';
  error.timeoutMs = timeoutMs;
  return error;
}

/**
 * Type guard for timeout errors.
 */
export function isTimeoutError(error: unknown): error is ResilientCallError {
  return error instanceof Error && error.name === 'ResilientCallTimeoutError';
}

/**
 * Wraps a call with a timeout.
 */
async function withTimeout<T>(
  call: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(createTimeoutError(timeoutMs));
      }
    }, timeoutMs);

    call()
      .then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}

/**
 * Creates a resilient call wrapper that composes multiple resilience patterns.
 *
 * @param config - Configuration for resilience patterns
 * @returns A function that executes calls with resilience patterns applied
 */
export function createResilientCall(
  config: ResilientCallConfig,
): <T>(call: () => Promise<T>) => Promise<T> {
  const { circuitBreaker, retryExecutor, bulkhead, timeoutMs } = config;

  return async <T>(call: () => Promise<T>): Promise<T> => {
    // Layer 1: Bulkhead (outermost - limits concurrency)
    const withBulkhead = bulkhead
      ? (innerCall: () => Promise<T>) => bulkhead.execute(innerCall)
      : (innerCall: () => Promise<T>) => innerCall();

    // Layer 2: Circuit Breaker
    const withCircuitBreaker = circuitBreaker
      ? (innerCall: () => Promise<T>) => circuitBreaker.execute(innerCall)
      : (innerCall: () => Promise<T>) => innerCall();

    // Layer 3: Retry
    const withRetry = retryExecutor
      ? (innerCall: () => Promise<T>) => retryExecutor.execute(innerCall)
      : (innerCall: () => Promise<T>) => innerCall();

    // Layer 4: Timeout (innermost - applied to each attempt)
    const withTimeoutWrapper =
      timeoutMs !== undefined && timeoutMs > 0
        ? (innerCall: () => Promise<T>) => withTimeout(innerCall, timeoutMs)
        : (innerCall: () => Promise<T>) => innerCall();

    // Compose: Bulkhead → CircuitBreaker → Retry → Timeout → Call
    return withBulkhead(() =>
      withCircuitBreaker(() => withRetry(() => withTimeoutWrapper(call))),
    );
  };
}

/**
 * Creates a no-op resilient call (passthrough).
 * Useful for testing or when resilience is disabled.
 */
export function createPassthroughCall(): <T>(call: () => Promise<T>) => Promise<T> {
  return <T>(call: () => Promise<T>): Promise<T> => call();
}
