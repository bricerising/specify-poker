import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createBulkhead,
  createBulkheadRejectedError,
  isBulkheadRejectedError,
  type BulkheadEvents,
} from '../src/resilience/bulkhead';

describe('Bulkhead', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts with zero active count', () => {
      const bulkhead = createBulkhead('test-service');
      expect(bulkhead.getActiveCount()).toBe(0);
    });

    it('starts with empty queue', () => {
      const bulkhead = createBulkhead('test-service');
      expect(bulkhead.getQueueLength()).toBe(0);
    });

    it('returns the service name', () => {
      const bulkhead = createBulkhead('my-service');
      expect(bulkhead.getServiceName()).toBe('my-service');
    });
  });

  describe('concurrent execution limiting', () => {
    it('allows concurrent executions up to limit', async () => {
      const bulkhead = createBulkhead('test-service', { maxConcurrent: 2 });
      const results: string[] = [];

      // Start 2 concurrent calls
      const p1 = bulkhead.execute(async () => {
        results.push('start-1');
        await new Promise((r) => setTimeout(r, 100));
        results.push('end-1');
        return 'result-1';
      });

      const p2 = bulkhead.execute(async () => {
        results.push('start-2');
        await new Promise((r) => setTimeout(r, 100));
        results.push('end-2');
        return 'result-2';
      });

      // Both should start immediately
      await vi.advanceTimersByTimeAsync(1);
      expect(results).toEqual(['start-1', 'start-2']);
      expect(bulkhead.getActiveCount()).toBe(2);

      // Complete them
      await vi.advanceTimersByTimeAsync(100);
      await Promise.all([p1, p2]);
      expect(bulkhead.getActiveCount()).toBe(0);
    });

    it('queues executions when at limit', async () => {
      const bulkhead = createBulkhead('test-service', { maxConcurrent: 1, maxQueueSize: 10 });
      const order: number[] = [];

      // First call - executes immediately
      const p1 = bulkhead.execute(async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 100));
        return 'result-1';
      });

      // Second call - queued
      const p2 = bulkhead.execute(async () => {
        order.push(2);
        await new Promise((r) => setTimeout(r, 100));
        return 'result-2';
      });

      await vi.advanceTimersByTimeAsync(1);
      expect(order).toEqual([1]);
      expect(bulkhead.getActiveCount()).toBe(1);
      expect(bulkhead.getQueueLength()).toBe(1);

      // Complete first, second should start
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1);
      expect(order).toEqual([1, 2]);
      expect(bulkhead.getActiveCount()).toBe(1);
      expect(bulkhead.getQueueLength()).toBe(0);

      // Complete second
      await vi.advanceTimersByTimeAsync(100);
      await Promise.all([p1, p2]);
      expect(bulkhead.getActiveCount()).toBe(0);
    });

    it('rejects when queue is full', async () => {
      const bulkhead = createBulkhead('test-service', {
        maxConcurrent: 1,
        maxQueueSize: 1,
      });

      // Fill up concurrent slot
      const p1 = bulkhead.execute(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'result-1';
      });

      // Fill up queue
      const p2 = bulkhead.execute(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'result-2';
      });

      await vi.advanceTimersByTimeAsync(1);
      expect(bulkhead.getActiveCount()).toBe(1);
      expect(bulkhead.getQueueLength()).toBe(1);

      // This should be rejected
      await expect(
        bulkhead.execute(async () => 'rejected'),
      ).rejects.toThrow("Bulkhead queue is full for service 'test-service'");

      // Cleanup
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.all([p1, p2]);
    });

    it('rejects immediately when maxQueueSize is 0', async () => {
      const bulkhead = createBulkhead('test-service', {
        maxConcurrent: 1,
        maxQueueSize: 0,
      });

      // Fill up concurrent slot
      const p1 = bulkhead.execute(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'result';
      });

      await vi.advanceTimersByTimeAsync(1);

      // Any additional call should be rejected
      await expect(
        bulkhead.execute(async () => 'rejected'),
      ).rejects.toThrow("Bulkhead queue is full for service 'test-service'");

      // Cleanup
      await vi.advanceTimersByTimeAsync(1000);
      await p1;
    });
  });

  describe('queue timeout', () => {
    it('rejects after queue timeout', async () => {
      const bulkhead = createBulkhead('test-service', {
        maxConcurrent: 1,
        maxQueueSize: 10,
        queueTimeoutMs: 500,
      });

      // Fill concurrent slot with a long-running call
      const p1 = bulkhead.execute(async () => {
        await new Promise((r) => setTimeout(r, 10000));
        return 'long-running';
      });

      await vi.advanceTimersByTimeAsync(1);

      // Queue a call - catch rejection to prevent unhandled rejection
      const p2 = bulkhead.execute(async () => 'queued').catch(() => 'caught');

      expect(bulkhead.getQueueLength()).toBe(1);

      // Advance past timeout - p2 will reject
      await vi.advanceTimersByTimeAsync(500);

      // Verify it was rejected
      const result = await p2;
      expect(result).toBe('caught');

      expect(bulkhead.getQueueLength()).toBe(0);

      // Cleanup - we need to handle the long-running call
      await vi.advanceTimersByTimeAsync(10000);
      await p1;
    });
  });

  describe('slot release', () => {
    it('releases slot after execution completes', async () => {
      const bulkhead = createBulkhead('test-service', { maxConcurrent: 1 });

      await bulkhead.execute(async () => 'success');
      expect(bulkhead.getActiveCount()).toBe(0);
    });

    it('releases slot after execution fails', async () => {
      const bulkhead = createBulkhead('test-service', { maxConcurrent: 1 });

      await expect(
        bulkhead.execute(async () => {
          throw new Error('fail');
        }),
      ).rejects.toThrow('fail');

      expect(bulkhead.getActiveCount()).toBe(0);
    });

    it('processes queue after slot release', async () => {
      const bulkhead = createBulkhead('test-service', { maxConcurrent: 1 });
      const order: string[] = [];

      const p1 = bulkhead.execute(async () => {
        order.push('first');
        await new Promise((r) => setTimeout(r, 100));
        return 'first';
      });

      const p2 = bulkhead.execute(async () => {
        order.push('second');
        return 'second';
      });

      await vi.advanceTimersByTimeAsync(1);
      expect(order).toEqual(['first']);

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1);
      expect(order).toEqual(['first', 'second']);

      await Promise.all([p1, p2]);
    });
  });

  describe('events', () => {
    it('emits acquire events', async () => {
      const onAcquire = vi.fn();
      const events: BulkheadEvents = { onAcquire };
      const bulkhead = createBulkhead('test-service', { maxConcurrent: 2 }, events);

      await bulkhead.execute(async () => 'success');

      expect(onAcquire).toHaveBeenCalledWith('test-service', 1, 0);
    });

    it('emits release events', async () => {
      const onRelease = vi.fn();
      const events: BulkheadEvents = { onRelease };
      const bulkhead = createBulkhead('test-service', { maxConcurrent: 2 }, events);

      await bulkhead.execute(async () => 'success');

      expect(onRelease).toHaveBeenCalledWith('test-service', 0, 0);
    });

    it('emits rejected events for queue full', async () => {
      const onRejected = vi.fn();
      const events: BulkheadEvents = { onRejected };
      const bulkhead = createBulkhead(
        'test-service',
        { maxConcurrent: 1, maxQueueSize: 0 },
        events,
      );

      const p1 = bulkhead.execute(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'busy';
      });

      await vi.advanceTimersByTimeAsync(1);

      await expect(bulkhead.execute(async () => 'rejected')).rejects.toThrow();

      expect(onRejected).toHaveBeenCalledWith('test-service', 'queue_full');

      await vi.advanceTimersByTimeAsync(100);
      await p1;
    });

    it('emits rejected events for queue timeout', async () => {
      const onRejected = vi.fn();
      const events: BulkheadEvents = { onRejected };
      const bulkhead = createBulkhead(
        'test-service',
        { maxConcurrent: 1, maxQueueSize: 10, queueTimeoutMs: 100 },
        events,
      );

      const p1 = bulkhead.execute(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'busy';
      });

      await vi.advanceTimersByTimeAsync(1);

      // Catch rejection to prevent unhandled rejection
      let rejected = false;
      const p2 = bulkhead.execute(async () => 'timeout').catch(() => {
        rejected = true;
      });

      await vi.advanceTimersByTimeAsync(100);
      await p2;

      expect(rejected).toBe(true);
      expect(onRejected).toHaveBeenCalledWith('test-service', 'queue_timeout');

      await vi.advanceTimersByTimeAsync(1000);
      await p1;
    });
  });
});

describe('createBulkheadRejectedError', () => {
  it('creates queue_full error with correct properties', () => {
    const error = createBulkheadRejectedError('my-service', 'queue_full');
    expect(error.name).toBe('BulkheadRejectedError');
    expect(error.serviceName).toBe('my-service');
    expect(error.reason).toBe('queue_full');
    expect(error.message).toBe("Bulkhead queue is full for service 'my-service'");
  });

  it('creates queue_timeout error with correct properties', () => {
    const error = createBulkheadRejectedError('my-service', 'queue_timeout');
    expect(error.name).toBe('BulkheadRejectedError');
    expect(error.serviceName).toBe('my-service');
    expect(error.reason).toBe('queue_timeout');
    expect(error.message).toBe("Bulkhead queue timeout for service 'my-service'");
  });
});

describe('isBulkheadRejectedError', () => {
  it('returns true for BulkheadRejectedError', () => {
    const error = createBulkheadRejectedError('test', 'queue_full');
    expect(isBulkheadRejectedError(error)).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isBulkheadRejectedError(new Error('test'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isBulkheadRejectedError('string')).toBe(false);
    expect(isBulkheadRejectedError(null)).toBe(false);
    expect(isBulkheadRejectedError(undefined)).toBe(false);
    expect(isBulkheadRejectedError({})).toBe(false);
  });
});
