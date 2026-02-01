import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createResilientCall,
  createPassthroughCall,
  createTimeoutError,
  isTimeoutError,
} from '../src/resilience/resilientCall';
import { createCircuitBreaker } from '../src/resilience/circuitBreaker';
import { createBulkhead } from '../src/resilience/bulkhead';
import { createGrpcRetryExecutor } from '../src/resilience/retryExecutor';

describe('createResilientCall', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic execution', () => {
    it('executes call when all components allow', async () => {
      const resilientCall = createResilientCall({});
      const result = await resilientCall(async () => 'success');
      expect(result).toBe('success');
    });

    it('propagates call result', async () => {
      const resilientCall = createResilientCall({});
      const result = await resilientCall(async () => ({ data: 42 }));
      expect(result).toEqual({ data: 42 });
    });

    it('propagates call errors', async () => {
      const resilientCall = createResilientCall({});
      await expect(
        resilientCall(async () => {
          throw new Error('call-failed');
        }),
      ).rejects.toThrow('call-failed');
    });
  });

  describe('timeout', () => {
    it('applies timeout to call', async () => {
      const resilientCall = createResilientCall({ timeoutMs: 100 });

      // Catch rejection to prevent unhandled rejection warning
      let caughtError: Error | null = null;
      const promise = resilientCall(async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'slow';
      }).catch((e) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.message).toBe('Call timed out after 100ms');
    });

    it('succeeds if call completes before timeout', async () => {
      const resilientCall = createResilientCall({ timeoutMs: 200 });

      const promise = resilientCall(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'fast';
      });

      await vi.advanceTimersByTimeAsync(50);

      const result = await promise;
      expect(result).toBe('fast');
    });

    it('ignores timeout if not configured', async () => {
      const resilientCall = createResilientCall({});

      const promise = resilientCall(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'no-timeout';
      });

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toBe('no-timeout');
    });
  });

  describe('circuit breaker integration', () => {
    it('propagates circuit breaker rejection', async () => {
      const circuitBreaker = createCircuitBreaker('test', { failureThreshold: 1 });

      // Trip the circuit
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error('trip');
        }),
      ).rejects.toThrow();

      const resilientCall = createResilientCall({ circuitBreaker });

      await expect(resilientCall(async () => 'blocked')).rejects.toThrow(
        "Circuit breaker is OPEN for service 'test'",
      );
    });

    it('records failures to circuit breaker', async () => {
      const circuitBreaker = createCircuitBreaker('test', { failureThreshold: 2 });
      const resilientCall = createResilientCall({ circuitBreaker });

      // First failure
      await expect(
        resilientCall(async () => {
          throw new Error('fail-1');
        }),
      ).rejects.toThrow();

      expect(circuitBreaker.getState()).toBe('CLOSED');

      // Second failure - trips circuit
      await expect(
        resilientCall(async () => {
          throw new Error('fail-2');
        }),
      ).rejects.toThrow();

      expect(circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('bulkhead integration', () => {
    it('propagates bulkhead rejection', async () => {
      const bulkhead = createBulkhead('test', { maxConcurrent: 1, maxQueueSize: 0 });

      const resilientCall = createResilientCall({ bulkhead });

      // Fill the slot
      const p1 = resilientCall(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'busy';
      });

      await vi.advanceTimersByTimeAsync(1);

      // This should be rejected
      await expect(resilientCall(async () => 'rejected')).rejects.toThrow(
        "Bulkhead queue is full for service 'test'",
      );

      await vi.advanceTimersByTimeAsync(1000);
      await p1;
    });

    it('limits concurrent calls', async () => {
      const bulkhead = createBulkhead('test', { maxConcurrent: 2 });
      const resilientCall = createResilientCall({ bulkhead });

      const calls: Promise<string>[] = [];
      for (let i = 0; i < 3; i++) {
        calls.push(
          resilientCall(async () => {
            await new Promise((r) => setTimeout(r, 100));
            return `result-${i}`;
          }),
        );
      }

      await vi.advanceTimersByTimeAsync(1);
      expect(bulkhead.getActiveCount()).toBe(2);
      expect(bulkhead.getQueueLength()).toBe(1);

      // First 2 calls complete at t=100, third starts and completes at t=200
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.all(calls);
    });
  });

  describe('retry integration', () => {
    it('retries through retry executor', async () => {
      const retryExecutor = createGrpcRetryExecutor({ maxAttempts: 3 });
      const resilientCall = createResilientCall({ retryExecutor });

      const transientError = Object.assign(new Error('unavailable'), { code: 14 });
      const call = vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue('success');

      const promise = resilientCall(call);

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toBe('success');
      expect(call).toHaveBeenCalledTimes(2);
    });
  });

  describe('composition', () => {
    it('composes patterns in correct order: Bulkhead → CB → Retry → Timeout', async () => {
      const order: string[] = [];

      const bulkhead = createBulkhead('test', { maxConcurrent: 10 });
      const originalBulkheadExecute = bulkhead.execute.bind(bulkhead);
      bulkhead.execute = async (call) => {
        order.push('bulkhead-start');
        const result = await originalBulkheadExecute(call);
        order.push('bulkhead-end');
        return result;
      };

      const circuitBreaker = createCircuitBreaker('test');
      const originalCBExecute = circuitBreaker.execute.bind(circuitBreaker);
      circuitBreaker.execute = async (call) => {
        order.push('cb-start');
        const result = await originalCBExecute(call);
        order.push('cb-end');
        return result;
      };

      const resilientCall = createResilientCall({
        bulkhead,
        circuitBreaker,
        timeoutMs: 5000,
      });

      await resilientCall(async () => {
        order.push('call');
        return 'done';
      });

      // Bulkhead should wrap everything
      expect(order[0]).toBe('bulkhead-start');
      expect(order[order.length - 1]).toBe('bulkhead-end');

      // Circuit breaker should be inside bulkhead
      expect(order.indexOf('cb-start')).toBeGreaterThan(order.indexOf('bulkhead-start'));
      expect(order.indexOf('cb-end')).toBeLessThan(order.indexOf('bulkhead-end'));

      // Call should be innermost
      expect(order.indexOf('call')).toBeGreaterThan(order.indexOf('cb-start'));
    });
  });
});

describe('createPassthroughCall', () => {
  it('passes through calls without modification', async () => {
    const passthrough = createPassthroughCall();
    const result = await passthrough(async () => 'direct');
    expect(result).toBe('direct');
  });

  it('propagates errors', async () => {
    const passthrough = createPassthroughCall();
    await expect(
      passthrough(async () => {
        throw new Error('pass-through-error');
      }),
    ).rejects.toThrow('pass-through-error');
  });
});

describe('createTimeoutError', () => {
  it('creates error with correct properties', () => {
    const error = createTimeoutError(5000);
    expect(error.name).toBe('ResilientCallTimeoutError');
    expect(error.timeoutMs).toBe(5000);
    expect(error.message).toBe('Call timed out after 5000ms');
  });
});

describe('isTimeoutError', () => {
  it('returns true for timeout errors', () => {
    const error = createTimeoutError(1000);
    expect(isTimeoutError(error)).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isTimeoutError(new Error('test'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTimeoutError('string')).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });
});
