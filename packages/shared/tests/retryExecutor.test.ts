import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createRetryExecutor,
  createGrpcRetryExecutor,
  isTransientGrpcError,
  TRANSIENT_GRPC_CODES,
  NON_RETRYABLE_GRPC_CODES,
} from '../src/resilience/retryExecutor';
import { createCircuitBreaker, createCircuitBreakerOpenError } from '../src/resilience/circuitBreaker';
import type { RetryStrategy } from '../src/retry';

describe('RetryExecutor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createTestStrategy = (maxAttempts: number): RetryStrategy => ({
    getDelayMs: (attempt) => attempt * 100,
    shouldRetry: (attempt) => attempt < maxAttempts,
  });

  describe('successful execution', () => {
    it('succeeds on first attempt without retry', async () => {
      const executor = createRetryExecutor({
        strategy: createTestStrategy(3),
        isRetryable: () => true,
      });

      const call = vi.fn().mockResolvedValue('success');
      const result = await executor.execute(call);

      expect(result).toBe('success');
      expect(call).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry behavior', () => {
    it('retries on retryable errors', async () => {
      const executor = createRetryExecutor({
        strategy: createTestStrategy(3),
        isRetryable: () => true,
      });

      const call = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValue('success');

      const promise = executor.execute(call);

      // First attempt fails
      await vi.advanceTimersByTimeAsync(1);

      // Wait for first retry delay (100ms)
      await vi.advanceTimersByTimeAsync(100);

      // Second attempt fails, wait for retry delay (200ms)
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(call).toHaveBeenCalledTimes(3);
    });

    it('does not retry on non-retryable errors', async () => {
      const executor = createRetryExecutor({
        strategy: createTestStrategy(3),
        isRetryable: (error) =>
          error instanceof Error && error.message !== 'permanent',
      });

      const call = vi.fn().mockRejectedValue(new Error('permanent'));

      await expect(executor.execute(call)).rejects.toThrow('permanent');
      expect(call).toHaveBeenCalledTimes(1);
    });

    it('respects max attempts from strategy', async () => {
      const executor = createRetryExecutor({
        strategy: createTestStrategy(2), // Only 1 retry
        isRetryable: () => true,
      });

      const call = vi.fn().mockRejectedValue(new Error('always-fail'));

      // Catch rejection to prevent unhandled rejection warning
      let caughtError: Error | null = null;
      const promise = executor.execute(call).catch((e) => {
        caughtError = e;
      });

      // First attempt + retry delay
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.message).toBe('always-fail');
      expect(call).toHaveBeenCalledTimes(2);
    });

    it('emits retry events', async () => {
      const onRetry = vi.fn();
      const executor = createRetryExecutor({
        strategy: createTestStrategy(3),
        isRetryable: () => true,
        onRetry,
      });

      const error1 = new Error('fail-1');
      const error2 = new Error('fail-2');
      const call = vi
        .fn()
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockResolvedValue('success');

      const promise = executor.execute(call);

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, error1, 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, error2, 200);
    });
  });

  describe('circuit breaker integration', () => {
    it('does not retry when circuit breaker is OPEN', async () => {
      const cb = createCircuitBreaker('test', { failureThreshold: 1 });

      // Trip the circuit
      await expect(
        cb.execute(async () => {
          throw new Error('trip');
        }),
      ).rejects.toThrow();

      const executor = createRetryExecutor({
        strategy: createTestStrategy(5),
        isRetryable: () => true,
        circuitBreaker: cb,
      });

      const call = vi.fn().mockRejectedValue(new Error('fail'));

      // Should fail immediately due to open circuit
      await expect(executor.execute(call)).rejects.toThrow('fail');
      expect(call).toHaveBeenCalledTimes(1);
    });
  });
});

describe('isTransientGrpcError', () => {
  describe('transient codes', () => {
    it.each([
      [4, 'DEADLINE_EXCEEDED'],
      [8, 'RESOURCE_EXHAUSTED'],
      [13, 'INTERNAL'],
      [14, 'UNAVAILABLE'],
    ])('returns true for code %d (%s)', (code) => {
      const error = Object.assign(new Error('test'), { code });
      expect(isTransientGrpcError(error)).toBe(true);
    });
  });

  describe('non-retryable codes', () => {
    it.each([
      [3, 'INVALID_ARGUMENT'],
      [5, 'NOT_FOUND'],
      [7, 'PERMISSION_DENIED'],
      [16, 'UNAUTHENTICATED'],
    ])('returns false for code %d (%s)', (code) => {
      const error = Object.assign(new Error('test'), { code });
      expect(isTransientGrpcError(error)).toBe(false);
    });
  });

  describe('error message patterns', () => {
    it('returns true for ECONNREFUSED', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:5000');
      expect(isTransientGrpcError(error)).toBe(true);
    });

    it('returns true for ECONNRESET', () => {
      const error = new Error('socket hang up (ECONNRESET)');
      expect(isTransientGrpcError(error)).toBe(true);
    });

    it('returns true for ETIMEDOUT', () => {
      const error = new Error('connect ETIMEDOUT');
      expect(isTransientGrpcError(error)).toBe(true);
    });

    it('returns true for unavailable message', () => {
      const error = new Error('Service unavailable');
      expect(isTransientGrpcError(error)).toBe(true);
    });

    it('returns true for deadline exceeded message', () => {
      const error = new Error('Deadline exceeded');
      expect(isTransientGrpcError(error)).toBe(true);
    });

    it('returns false for generic error', () => {
      const error = new Error('Something went wrong');
      expect(isTransientGrpcError(error)).toBe(false);
    });
  });

  describe('special cases', () => {
    it('returns false for CircuitBreakerOpenError', () => {
      const error = createCircuitBreakerOpenError('test-service');
      expect(isTransientGrpcError(error)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isTransientGrpcError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isTransientGrpcError(undefined)).toBe(false);
    });

    it('returns false for non-Error objects', () => {
      expect(isTransientGrpcError({ code: 14 })).toBe(false);
    });
  });
});

describe('TRANSIENT_GRPC_CODES', () => {
  it('includes DEADLINE_EXCEEDED (4)', () => {
    expect(TRANSIENT_GRPC_CODES.has(4)).toBe(true);
  });

  it('includes RESOURCE_EXHAUSTED (8)', () => {
    expect(TRANSIENT_GRPC_CODES.has(8)).toBe(true);
  });

  it('includes INTERNAL (13)', () => {
    expect(TRANSIENT_GRPC_CODES.has(13)).toBe(true);
  });

  it('includes UNAVAILABLE (14)', () => {
    expect(TRANSIENT_GRPC_CODES.has(14)).toBe(true);
  });

  it('does not include INVALID_ARGUMENT (3)', () => {
    expect(TRANSIENT_GRPC_CODES.has(3)).toBe(false);
  });
});

describe('NON_RETRYABLE_GRPC_CODES', () => {
  it('includes INVALID_ARGUMENT (3)', () => {
    expect(NON_RETRYABLE_GRPC_CODES.has(3)).toBe(true);
  });

  it('includes NOT_FOUND (5)', () => {
    expect(NON_RETRYABLE_GRPC_CODES.has(5)).toBe(true);
  });

  it('includes PERMISSION_DENIED (7)', () => {
    expect(NON_RETRYABLE_GRPC_CODES.has(7)).toBe(true);
  });

  it('includes UNAUTHENTICATED (16)', () => {
    expect(NON_RETRYABLE_GRPC_CODES.has(16)).toBe(true);
  });
});

describe('createGrpcRetryExecutor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates executor with default settings', async () => {
    const executor = createGrpcRetryExecutor();

    const call = vi.fn().mockResolvedValue('success');
    const result = await executor.execute(call);

    expect(result).toBe('success');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('retries on transient gRPC errors', async () => {
    const executor = createGrpcRetryExecutor({ maxAttempts: 3 });

    const transientError = Object.assign(new Error('unavailable'), { code: 14 });
    const call = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue('success');

    const promise = executor.execute(call);

    // Advance through retry delays
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe('success');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-transient gRPC errors', async () => {
    const executor = createGrpcRetryExecutor({ maxAttempts: 3 });

    const permanentError = Object.assign(new Error('invalid'), { code: 3 });
    const call = vi.fn().mockRejectedValue(permanentError);

    await expect(executor.execute(call)).rejects.toThrow('invalid');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('respects custom maxAttempts', async () => {
    const executor = createGrpcRetryExecutor({ maxAttempts: 2 });

    const transientError = Object.assign(new Error('unavailable'), { code: 14 });
    const call = vi.fn().mockRejectedValue(transientError);

    // Catch rejection to prevent unhandled rejection warning
    let caughtError: Error | null = null;
    const promise = executor.execute(call).catch((e) => {
      caughtError = e;
    });

    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError?.message).toBe('unavailable');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('integrates with circuit breaker', async () => {
    const cb = createCircuitBreaker('test', { failureThreshold: 1 });

    // Trip the circuit
    await expect(
      cb.execute(async () => {
        throw new Error('trip');
      }),
    ).rejects.toThrow();

    const executor = createGrpcRetryExecutor({
      maxAttempts: 5,
      circuitBreaker: cb,
    });

    const transientError = Object.assign(new Error('unavailable'), { code: 14 });
    const call = vi.fn().mockRejectedValue(transientError);

    await expect(executor.execute(call)).rejects.toThrow();
    // Should only try once because circuit is open
    expect(call).toHaveBeenCalledTimes(1);
  });
});
