import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createCircuitBreaker,
  createCircuitBreakerOpenError,
  isCircuitBreakerOpenError,
  type CircuitBreaker,
  type CircuitBreakerEvents,
} from '../src/resilience/circuitBreaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const cb = createCircuitBreaker('test-service');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('returns the service name', () => {
      const cb = createCircuitBreaker('my-service');
      expect(cb.getServiceName()).toBe('my-service');
    });
  });

  describe('CLOSED state behavior', () => {
    it('allows calls to pass through', async () => {
      const cb = createCircuitBreaker('test-service');
      const result = await cb.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('transitions to OPEN after failure threshold', async () => {
      const cb = createCircuitBreaker('test-service', { failureThreshold: 3 });

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe('OPEN');
    });

    it('does not transition to OPEN below threshold', async () => {
      const cb = createCircuitBreaker('test-service', { failureThreshold: 5 });

      // Fail 4 times (below threshold)
      for (let i = 0; i < 4; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe('CLOSED');
    });

    it('uses sliding window for failure tracking', async () => {
      const cb = createCircuitBreaker('test-service', {
        failureThreshold: 3,
        windowSize: 5,
      });

      // 2 failures
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      // 3 successes (pushes failures out of window)
      for (let i = 0; i < 3; i++) {
        await cb.execute(async () => 'success');
      }

      // 2 more failures (total 2 in window, below threshold)
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      expect(cb.getState()).toBe('CLOSED');
    });
  });

  describe('OPEN state behavior', () => {
    let cb: CircuitBreaker;

    beforeEach(async () => {
      cb = createCircuitBreaker('test-service', {
        failureThreshold: 2,
        openDurationMs: 10000,
      });

      // Trip the circuit
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }
    });

    it('rejects calls immediately when OPEN', async () => {
      await expect(cb.execute(async () => 'success')).rejects.toThrow(
        "Circuit breaker is OPEN for service 'test-service'",
      );
    });

    it('throws CircuitBreakerOpenError when OPEN', async () => {
      try {
        await cb.execute(async () => 'success');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isCircuitBreakerOpenError(error)).toBe(true);
        if (isCircuitBreakerOpenError(error)) {
          expect(error.serviceName).toBe('test-service');
        }
      }
    });

    it('transitions to HALF_OPEN after open duration', async () => {
      expect(cb.getState()).toBe('OPEN');

      // Advance time past open duration
      vi.advanceTimersByTime(10001);

      expect(cb.getState()).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state behavior', () => {
    let cb: CircuitBreaker;

    beforeEach(async () => {
      cb = createCircuitBreaker('test-service', {
        failureThreshold: 2,
        openDurationMs: 10000,
        halfOpenSuccessThreshold: 2,
      });

      // Trip the circuit
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(10001);
      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('allows test calls through', async () => {
      const result = await cb.execute(async () => 'test-success');
      expect(result).toBe('test-success');
    });

    it('transitions to CLOSED after success threshold', async () => {
      await cb.execute(async () => 'success1');
      expect(cb.getState()).toBe('HALF_OPEN');

      await cb.execute(async () => 'success2');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('transitions back to OPEN on any failure', async () => {
      // One success
      await cb.execute(async () => 'success');
      expect(cb.getState()).toBe('HALF_OPEN');

      // One failure - immediately reopens
      await expect(cb.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('events', () => {
    it('emits state change events', async () => {
      const onStateChange = vi.fn();
      const events: CircuitBreakerEvents = { onStateChange };

      const cb = createCircuitBreaker('test-service', { failureThreshold: 2 }, events);

      // Trip the circuit
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN', 'test-service');
    });

    it('emits rejected events when OPEN', async () => {
      const onRejected = vi.fn();
      const events: CircuitBreakerEvents = { onRejected };

      const cb = createCircuitBreaker('test-service', { failureThreshold: 1 }, events);

      // Trip the circuit
      await expect(cb.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();

      // Try to call when open
      await expect(cb.execute(async () => 'success')).rejects.toThrow();

      expect(onRejected).toHaveBeenCalledWith('test-service');
    });

    it('emits state change for full cycle', async () => {
      const onStateChange = vi.fn();
      const events: CircuitBreakerEvents = { onStateChange };

      const cb = createCircuitBreaker(
        'test-service',
        {
          failureThreshold: 1,
          openDurationMs: 5000,
          halfOpenSuccessThreshold: 1,
        },
        events,
      );

      // CLOSED -> OPEN
      await expect(cb.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN', 'test-service');

      // OPEN -> HALF_OPEN
      vi.advanceTimersByTime(5001);
      cb.getState(); // Trigger transition check
      expect(onStateChange).toHaveBeenCalledWith('OPEN', 'HALF_OPEN', 'test-service');

      // HALF_OPEN -> CLOSED
      await cb.execute(async () => 'success');
      expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'CLOSED', 'test-service');
    });
  });

  describe('reset', () => {
    it('can be reset programmatically', async () => {
      const cb = createCircuitBreaker('test-service', { failureThreshold: 1 });

      // Trip the circuit
      await expect(cb.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      expect(cb.getState()).toBe('OPEN');

      // Reset
      cb.reset();
      expect(cb.getState()).toBe('CLOSED');

      // Should allow calls again
      const result = await cb.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('clears failure window on reset', async () => {
      const cb = createCircuitBreaker('test-service', { failureThreshold: 3 });

      // 2 failures
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      cb.reset();

      // 2 more failures (should not trip, window was cleared)
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      expect(cb.getState()).toBe('CLOSED');
    });
  });

  describe('manual recording', () => {
    it('recordSuccess counts toward HALF_OPEN threshold', async () => {
      const cb = createCircuitBreaker('test-service', {
        failureThreshold: 1,
        openDurationMs: 1000,
        halfOpenSuccessThreshold: 2,
      });

      // Trip and transition to HALF_OPEN
      await expect(cb.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      vi.advanceTimersByTime(1001);

      expect(cb.getState()).toBe('HALF_OPEN');

      cb.recordSuccess();
      expect(cb.getState()).toBe('HALF_OPEN');

      cb.recordSuccess();
      expect(cb.getState()).toBe('CLOSED');
    });

    it('recordFailure in HALF_OPEN reopens circuit', async () => {
      const cb = createCircuitBreaker('test-service', {
        failureThreshold: 1,
        openDurationMs: 1000,
      });

      // Trip and transition to HALF_OPEN
      await expect(cb.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
      vi.advanceTimersByTime(1001);

      expect(cb.getState()).toBe('HALF_OPEN');

      cb.recordFailure();
      expect(cb.getState()).toBe('OPEN');
    });
  });
});

describe('createCircuitBreakerOpenError', () => {
  it('creates an error with correct name and service', () => {
    const error = createCircuitBreakerOpenError('my-service');
    expect(error.name).toBe('CircuitBreakerOpenError');
    expect(error.serviceName).toBe('my-service');
    expect(error.message).toBe("Circuit breaker is OPEN for service 'my-service'");
  });
});

describe('isCircuitBreakerOpenError', () => {
  it('returns true for CircuitBreakerOpenError', () => {
    const error = createCircuitBreakerOpenError('test');
    expect(isCircuitBreakerOpenError(error)).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isCircuitBreakerOpenError(new Error('test'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isCircuitBreakerOpenError('string')).toBe(false);
    expect(isCircuitBreakerOpenError(null)).toBe(false);
    expect(isCircuitBreakerOpenError(undefined)).toBe(false);
    expect(isCircuitBreakerOpenError({})).toBe(false);
  });
});
