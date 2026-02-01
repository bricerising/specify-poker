/**
 * Per-service resilience configuration and management.
 *
 * Creates and manages resilience components (circuit breaker, retry, bulkhead)
 * for each downstream service with service-specific thresholds.
 *
 * @example
 * ```ts
 * const manager = createServiceResilienceManager({
 *   balance: {
 *     circuitBreaker: { failureThreshold: 3, openDurationMs: 15000 },
 *     retry: { maxAttempts: 2 },
 *     bulkhead: { maxConcurrent: 30 },
 *     timeoutMs: 3000,
 *   },
 *   game: {
 *     circuitBreaker: { failureThreshold: 5, openDurationMs: 30000 },
 *     retry: { maxAttempts: 3 },
 *     bulkhead: { maxConcurrent: 50 },
 *     timeoutMs: 2000,
 *   },
 * });
 *
 * const result = await manager.getExecutor('balance')(() => balanceClient.call());
 * ```
 */

import { createCircuitBreaker, type CircuitBreaker, type CircuitBreakerConfig } from './circuitBreaker';
import { createBulkhead, type Bulkhead, type BulkheadConfig } from './bulkhead';
import { createGrpcRetryExecutor, type RetryExecutor } from './retryExecutor';
import { createResilientCall, createPassthroughCall } from './resilientCall';
import type { RetryStrategy } from '../retry';
import { exponentialBackoff, withJitter } from '../retry';

export type ServiceCircuitBreakerConfig = Partial<CircuitBreakerConfig>;

export type ServiceRetryConfig = {
  /** Retry strategy (default: exponential backoff with jitter) */
  strategy?: RetryStrategy;
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff (default: 100) */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 5000) */
  maxDelayMs?: number;
};

export type ServiceBulkheadConfig = Partial<BulkheadConfig>;

export type ServiceResilienceConfig = {
  /** Circuit breaker configuration */
  circuitBreaker?: ServiceCircuitBreakerConfig;
  /** Retry configuration */
  retry?: ServiceRetryConfig;
  /** Bulkhead configuration */
  bulkhead?: ServiceBulkheadConfig;
  /** Timeout in ms for calls */
  timeoutMs?: number;
  /** Whether resilience is enabled for this service (default: true) */
  enabled?: boolean;
};

export type ServiceResilienceMap = Record<string, ServiceResilienceConfig>;

export type ServiceResilienceEvents = {
  /** Called when a circuit breaker changes state */
  onCircuitStateChange?: (serviceName: string, from: string, to: string) => void;
  /** Called when a retry is attempted */
  onRetry?: (serviceName: string, attempt: number, error: unknown, delayMs: number) => void;
  /** Called when a bulkhead rejects a request */
  onBulkheadRejected?: (serviceName: string, reason: string) => void;
  /** Called when a circuit breaker rejects a request */
  onCircuitRejected?: (serviceName: string) => void;
};

export type ServiceStats = {
  /** Current number of active executions */
  active: number;
  /** Current queue length */
  queued: number;
  /** Current circuit breaker state */
  circuitState: string;
};

export type ServiceResilienceManager = {
  /** Get a resilient call executor for a service */
  getExecutor(serviceName: string): <T>(call: () => Promise<T>) => Promise<T>;
  /** Get the current circuit breaker state for a service */
  getCircuitState(serviceName: string): string | undefined;
  /** Get statistics for a service */
  getStats(serviceName: string): ServiceStats | undefined;
  /** Get all configured service names */
  getServiceNames(): string[];
  /** Reset a service's circuit breaker (for testing) */
  resetCircuitBreaker(serviceName: string): void;
};

type ServiceComponents = {
  circuitBreaker?: CircuitBreaker;
  retryExecutor?: RetryExecutor;
  bulkhead?: Bulkhead;
  executor: <T>(call: () => Promise<T>) => Promise<T>;
};

/**
 * Creates a service resilience manager.
 *
 * @param config - Per-service resilience configuration
 * @param events - Optional event callbacks for observability
 */
export function createServiceResilienceManager(
  config: ServiceResilienceMap,
  events?: ServiceResilienceEvents,
): ServiceResilienceManager {
  const services = new Map<string, ServiceComponents>();

  // Initialize components for each service
  for (const [serviceName, serviceConfig] of Object.entries(config)) {
    if (serviceConfig.enabled === false) {
      services.set(serviceName, {
        executor: createPassthroughCall(),
      });
      continue;
    }

    // Create circuit breaker
    let circuitBreaker: CircuitBreaker | undefined;
    if (serviceConfig.circuitBreaker) {
      circuitBreaker = createCircuitBreaker(serviceName, serviceConfig.circuitBreaker, {
        onStateChange: (from, to, name) => {
          events?.onCircuitStateChange?.(name, from, to);
        },
        onRejected: (name) => {
          events?.onCircuitRejected?.(name);
        },
      });
    }

    // Create bulkhead
    let bulkhead: Bulkhead | undefined;
    if (serviceConfig.bulkhead) {
      bulkhead = createBulkhead(serviceName, serviceConfig.bulkhead, {
        onRejected: (name, reason) => {
          events?.onBulkheadRejected?.(name, reason);
        },
      });
    }

    // Create retry executor
    let retryExecutor: RetryExecutor | undefined;
    if (serviceConfig.retry) {
      const retryConfig = serviceConfig.retry;
      const maxAttempts = retryConfig.maxAttempts ?? 3;
      const baseDelayMs = retryConfig.baseDelayMs ?? 100;
      const maxDelayMs = retryConfig.maxDelayMs ?? 5000;

      const _strategy =
        retryConfig.strategy ??
        withJitter(
          exponentialBackoff({
            baseMs: baseDelayMs,
            maxMs: maxDelayMs,
            maxAttempts,
          }),
        );

      retryExecutor = createGrpcRetryExecutor({
        maxAttempts,
        baseDelayMs,
        maxDelayMs,
        circuitBreaker,
        onRetry: (attempt, error, delayMs) => {
          events?.onRetry?.(serviceName, attempt, error, delayMs);
        },
      });
    }

    // Create resilient call executor
    const executor = createResilientCall({
      circuitBreaker,
      retryExecutor,
      bulkhead,
      timeoutMs: serviceConfig.timeoutMs,
    });

    services.set(serviceName, {
      circuitBreaker,
      retryExecutor,
      bulkhead,
      executor,
    });
  }

  // Create a default passthrough for unknown services
  const defaultExecutor = createPassthroughCall();

  return {
    getExecutor(serviceName: string) {
      const components = services.get(serviceName);
      return components?.executor ?? defaultExecutor;
    },

    getCircuitState(serviceName: string) {
      const components = services.get(serviceName);
      return components?.circuitBreaker?.getState();
    },

    getStats(serviceName: string) {
      const components = services.get(serviceName);
      if (!components) return undefined;

      return {
        active: components.bulkhead?.getActiveCount() ?? 0,
        queued: components.bulkhead?.getQueueLength() ?? 0,
        circuitState: components.circuitBreaker?.getState() ?? 'N/A',
      };
    },

    getServiceNames() {
      return Array.from(services.keys());
    },

    resetCircuitBreaker(serviceName: string) {
      const components = services.get(serviceName);
      components?.circuitBreaker?.reset();
    },
  };
}
