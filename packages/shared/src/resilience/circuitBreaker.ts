/**
 * Circuit Breaker pattern implementation for service resilience.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit is tripped, requests are rejected immediately
 * - HALF_OPEN: Testing if service has recovered
 *
 * @example
 * ```ts
 * const cb = createCircuitBreaker('game-service', {
 *   failureThreshold: 5,
 *   openDurationMs: 30000,
 * });
 *
 * try {
 *   const result = await cb.execute(() => grpcClient.call(request));
 * } catch (err) {
 *   if (isCircuitBreakerOpenError(err)) {
 *     // Fast-fail, service is unavailable
 *   }
 * }
 * ```
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type CircuitBreakerConfig = {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms to wait before transitioning to HALF_OPEN (default: 30000) */
  openDurationMs: number;
  /** Number of successful calls in HALF_OPEN to close circuit (default: 2) */
  halfOpenSuccessThreshold: number;
  /** Sliding window size for failure tracking (default: 10) */
  windowSize: number;
};

export type CircuitBreakerEvents = {
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState, serviceName: string) => void;
  onRejected?: (serviceName: string) => void;
};

export type CircuitBreaker = {
  /** Get current state */
  getState(): CircuitBreakerState;
  /** Get the service name */
  getServiceName(): string;
  /** Execute a call through the circuit breaker */
  execute<T>(call: () => Promise<T>): Promise<T>;
  /** Record a successful call (for external use) */
  recordSuccess(): void;
  /** Record a failed call (for external use) */
  recordFailure(): void;
  /** Force reset to CLOSED state (for testing) */
  reset(): void;
};

export type CircuitBreakerOpenError = Error & {
  name: 'CircuitBreakerOpenError';
  serviceName: string;
};

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  openDurationMs: 30_000,
  halfOpenSuccessThreshold: 2,
  windowSize: 10,
};

/**
 * Creates a CircuitBreakerOpenError for when the circuit is open.
 */
export function createCircuitBreakerOpenError(serviceName: string): CircuitBreakerOpenError {
  const error = new Error(
    `Circuit breaker is OPEN for service '${serviceName}'`,
  ) as CircuitBreakerOpenError;
  error.name = 'CircuitBreakerOpenError';
  error.serviceName = serviceName;
  return error;
}

/**
 * Type guard for CircuitBreakerOpenError.
 */
export function isCircuitBreakerOpenError(error: unknown): error is CircuitBreakerOpenError {
  return (
    error instanceof Error &&
    error.name === 'CircuitBreakerOpenError' &&
    'serviceName' in error
  );
}

/**
 * Creates a circuit breaker for a service.
 *
 * @param serviceName - Name of the service (for logging/metrics)
 * @param config - Circuit breaker configuration
 * @param events - Optional event callbacks for state changes
 */
export function createCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>,
  events?: CircuitBreakerEvents,
): CircuitBreaker {
  const cfg: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };

  let state: CircuitBreakerState = 'CLOSED';
  let openedAt: number | null = null;
  let halfOpenSuccessCount = 0;

  // Sliding window for failure tracking (circular buffer)
  const failureWindow: boolean[] = new Array(cfg.windowSize).fill(false);
  let windowIndex = 0;

  const getFailureCount = (): number => {
    return failureWindow.filter(Boolean).length;
  };

  const recordOutcome = (failed: boolean): void => {
    failureWindow[windowIndex] = failed;
    windowIndex = (windowIndex + 1) % cfg.windowSize;
  };

  const clearWindow = (): void => {
    failureWindow.fill(false);
    windowIndex = 0;
  };

  const transitionTo = (newState: CircuitBreakerState): void => {
    if (state === newState) return;

    const oldState = state;
    state = newState;

    if (newState === 'OPEN') {
      openedAt = Date.now();
      halfOpenSuccessCount = 0;
    } else if (newState === 'HALF_OPEN') {
      halfOpenSuccessCount = 0;
    } else if (newState === 'CLOSED') {
      openedAt = null;
      halfOpenSuccessCount = 0;
      clearWindow();
    }

    events?.onStateChange?.(oldState, newState, serviceName);
  };

  const shouldTransitionToHalfOpen = (): boolean => {
    if (state !== 'OPEN' || openedAt === null) return false;
    return Date.now() - openedAt >= cfg.openDurationMs;
  };

  const getState = (): CircuitBreakerState => {
    // Check for automatic transition to HALF_OPEN
    if (shouldTransitionToHalfOpen()) {
      transitionTo('HALF_OPEN');
    }
    return state;
  };

  const recordSuccess = (): void => {
    if (state === 'HALF_OPEN') {
      halfOpenSuccessCount++;
      if (halfOpenSuccessCount >= cfg.halfOpenSuccessThreshold) {
        transitionTo('CLOSED');
      }
    } else if (state === 'CLOSED') {
      recordOutcome(false);
    }
  };

  const recordFailure = (): void => {
    if (state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN reopens the circuit
      transitionTo('OPEN');
    } else if (state === 'CLOSED') {
      recordOutcome(true);
      if (getFailureCount() >= cfg.failureThreshold) {
        transitionTo('OPEN');
      }
    }
  };

  const execute = async <T>(call: () => Promise<T>): Promise<T> => {
    const currentState = getState();

    if (currentState === 'OPEN') {
      events?.onRejected?.(serviceName);
      throw createCircuitBreakerOpenError(serviceName);
    }

    try {
      const result = await call();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure();
      throw error;
    }
  };

  const reset = (): void => {
    // Always clear the window and reset state, even if already CLOSED
    state = 'CLOSED';
    openedAt = null;
    halfOpenSuccessCount = 0;
    clearWindow();
  };

  return {
    getState,
    getServiceName: () => serviceName,
    execute,
    recordSuccess,
    recordFailure,
    reset,
  };
}
