/**
 * Retry strategy utilities for configurable backoff and retry logic.
 *
 * @example
 * ```ts
 * const strategy = exponentialBackoff({ baseMs: 1000, maxMs: 30000 });
 *
 * let attempt = 0;
 * while (strategy.shouldRetry(attempt)) {
 *   try {
 *     await doSomething();
 *     break;
 *   } catch {
 *     attempt++;
 *     await sleep(strategy.getDelayMs(attempt));
 *   }
 * }
 * ```
 */

/** Strategy for determining retry delays and limits */
export type RetryStrategy = {
  /** Get the delay in milliseconds for the given attempt number (1-indexed) */
  getDelayMs(attempt: number): number;
  /** Check if another retry should be attempted */
  shouldRetry(attempt: number): boolean;
};

export type ExponentialBackoffOptions = {
  /** Base delay in milliseconds (default: 1000) */
  baseMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxMs?: number;
  /** Maximum number of attempts before giving up (default: Infinity) */
  maxAttempts?: number;
  /** Multiplier for each attempt (default: 2) */
  multiplier?: number;
};

/**
 * Creates an exponential backoff retry strategy.
 *
 * Delay formula: min(baseMs * multiplier^(attempt-1), maxMs)
 *
 * @example
 * ```ts
 * const strategy = exponentialBackoff({
 *   baseMs: 1000,    // Start with 1 second
 *   maxMs: 30000,    // Cap at 30 seconds
 *   maxAttempts: 5,  // Give up after 5 attempts
 * });
 *
 * // Delays: 1s, 2s, 4s, 8s, 16s (capped at 30s)
 * ```
 */
export function exponentialBackoff(options: ExponentialBackoffOptions = {}): RetryStrategy {
  const { baseMs = 1000, maxMs = 30_000, maxAttempts = Infinity, multiplier = 2 } = options;

  return {
    getDelayMs: (attempt) => {
      const delay = baseMs * multiplier ** (attempt - 1);
      return Math.min(delay, maxMs);
    },
    shouldRetry: (attempt) => attempt < maxAttempts,
  };
}

export type ConstantBackoffOptions = {
  /** Delay in milliseconds (default: 1000) */
  delayMs?: number;
  /** Maximum number of attempts (default: Infinity) */
  maxAttempts?: number;
};

/**
 * Creates a constant delay retry strategy.
 *
 * @example
 * ```ts
 * const strategy = constantBackoff({ delayMs: 5000, maxAttempts: 3 });
 * // Always waits 5 seconds between retries, max 3 attempts
 * ```
 */
export function constantBackoff(options: ConstantBackoffOptions = {}): RetryStrategy {
  const { delayMs = 1000, maxAttempts = Infinity } = options;

  return {
    getDelayMs: () => delayMs,
    shouldRetry: (attempt) => attempt < maxAttempts,
  };
}

export type LinearBackoffOptions = {
  /** Initial delay in milliseconds (default: 1000) */
  initialMs?: number;
  /** Increment per attempt in milliseconds (default: 1000) */
  incrementMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxMs?: number;
  /** Maximum number of attempts (default: Infinity) */
  maxAttempts?: number;
};

/**
 * Creates a linear backoff retry strategy.
 *
 * Delay formula: min(initialMs + incrementMs * (attempt - 1), maxMs)
 *
 * @example
 * ```ts
 * const strategy = linearBackoff({
 *   initialMs: 1000,
 *   incrementMs: 2000,
 *   maxMs: 10000,
 * });
 * // Delays: 1s, 3s, 5s, 7s, 9s, 10s (capped)
 * ```
 */
export function linearBackoff(options: LinearBackoffOptions = {}): RetryStrategy {
  const { initialMs = 1000, incrementMs = 1000, maxMs = 30_000, maxAttempts = Infinity } = options;

  return {
    getDelayMs: (attempt) => {
      const delay = initialMs + incrementMs * (attempt - 1);
      return Math.min(delay, maxMs);
    },
    shouldRetry: (attempt) => attempt < maxAttempts,
  };
}

/**
 * Adds jitter to an existing retry strategy to prevent thundering herd.
 *
 * @param strategy - The base strategy to add jitter to
 * @param jitterFactor - Factor of randomness (0-1, default: 0.1 = ±10%)
 *
 * @example
 * ```ts
 * const strategy = withJitter(exponentialBackoff(), 0.2);
 * // Adds ±20% randomness to each delay
 * ```
 */
export function withJitter(strategy: RetryStrategy, jitterFactor: number = 0.1): RetryStrategy {
  return {
    getDelayMs: (attempt) => {
      const baseDelay = strategy.getDelayMs(attempt);
      const jitter = baseDelay * jitterFactor * (Math.random() * 2 - 1);
      return Math.max(0, Math.round(baseDelay + jitter));
    },
    shouldRetry: strategy.shouldRetry,
  };
}
