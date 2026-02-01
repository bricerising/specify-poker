/**
 * Resilience patterns for enterprise service communication.
 *
 * This module provides composable resilience primitives:
 * - Circuit Breaker: Fast-fail when a service is down
 * - Bulkhead: Concurrency limiting to prevent resource exhaustion
 * - Retry: Automatic retry with backoff for transient failures
 * - Resilient Call: Composition of all patterns
 * - Service Manager: Per-service configuration and management
 *
 * @example
 * ```ts
 * import {
 *   createServiceResilienceManager,
 *   isCircuitBreakerOpenError,
 *   isBulkheadRejectedError,
 * } from '@specify-poker/shared';
 *
 * const manager = createServiceResilienceManager({
 *   balance: {
 *     circuitBreaker: { failureThreshold: 3 },
 *     retry: { maxAttempts: 2 },
 *     bulkhead: { maxConcurrent: 30 },
 *   },
 * });
 *
 * try {
 *   await manager.getExecutor('balance')(() => balanceClient.call());
 * } catch (error) {
 *   if (isCircuitBreakerOpenError(error)) {
 *     // Service is down, fast-fail
 *   } else if (isBulkheadRejectedError(error)) {
 *     // Too many concurrent requests
 *   }
 * }
 * ```
 */

export {
  createCircuitBreaker,
  createCircuitBreakerOpenError,
  isCircuitBreakerOpenError,
  type CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerEvents,
  type CircuitBreakerState,
  type CircuitBreakerOpenError,
} from './circuitBreaker';

export {
  createBulkhead,
  createBulkheadRejectedError,
  isBulkheadRejectedError,
  type Bulkhead,
  type BulkheadConfig,
  type BulkheadEvents,
  type BulkheadRejectedError,
  type BulkheadRejectionReason,
} from './bulkhead';

export {
  createRetryExecutor,
  createGrpcRetryExecutor,
  isTransientGrpcError,
  TRANSIENT_GRPC_CODES,
  NON_RETRYABLE_GRPC_CODES,
  type RetryExecutor,
  type RetryExecutorConfig,
  type RetryableErrorPredicate,
} from './retryExecutor';

export {
  createResilientCall,
  createPassthroughCall,
  createTimeoutError,
  isTimeoutError,
  type ResilientCallConfig,
  type ResilientCallError,
} from './resilientCall';

export {
  createServiceResilienceManager,
  type ServiceResilienceManager,
  type ServiceResilienceConfig,
  type ServiceResilienceMap,
  type ServiceResilienceEvents,
  type ServiceStats,
  type ServiceCircuitBreakerConfig,
  type ServiceRetryConfig,
  type ServiceBulkheadConfig,
} from './serviceResilience';
