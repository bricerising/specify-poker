/**
 * Bulkhead pattern implementation for concurrency limiting.
 *
 * Limits the number of concurrent executions to prevent resource exhaustion.
 * Excess requests are queued (up to a limit) or rejected.
 *
 * @example
 * ```ts
 * const bulkhead = createBulkhead('database', {
 *   maxConcurrent: 10,
 *   maxQueueSize: 50,
 *   queueTimeoutMs: 5000,
 * });
 *
 * try {
 *   const result = await bulkhead.execute(() => db.query(sql));
 * } catch (err) {
 *   if (isBulkheadRejectedError(err)) {
 *     // Queue was full or timed out
 *   }
 * }
 * ```
 */

export type BulkheadConfig = {
  /** Maximum concurrent executions (default: 10) */
  maxConcurrent: number;
  /** Maximum queue size (default: 100, 0 = reject immediately when full) */
  maxQueueSize: number;
  /** Queue timeout in ms (default: 5000) */
  queueTimeoutMs: number;
};

export type BulkheadRejectionReason = 'queue_full' | 'queue_timeout';

export type BulkheadEvents = {
  onAcquire?: (serviceName: string, concurrent: number, queued: number) => void;
  onRelease?: (serviceName: string, concurrent: number, queued: number) => void;
  onRejected?: (serviceName: string, reason: BulkheadRejectionReason) => void;
};

export type Bulkhead = {
  /** Execute with concurrency control */
  execute<T>(call: () => Promise<T>): Promise<T>;
  /** Current number of active executions */
  getActiveCount(): number;
  /** Current queue length */
  getQueueLength(): number;
  /** Get the service name */
  getServiceName(): string;
};

export type BulkheadRejectedError = Error & {
  name: 'BulkheadRejectedError';
  serviceName: string;
  reason: BulkheadRejectionReason;
};

type QueuedRequest = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const DEFAULT_CONFIG: BulkheadConfig = {
  maxConcurrent: 10,
  maxQueueSize: 100,
  queueTimeoutMs: 5000,
};

/**
 * Creates a BulkheadRejectedError for when the request is rejected.
 */
export function createBulkheadRejectedError(
  serviceName: string,
  reason: BulkheadRejectionReason,
): BulkheadRejectedError {
  const message =
    reason === 'queue_full'
      ? `Bulkhead queue is full for service '${serviceName}'`
      : `Bulkhead queue timeout for service '${serviceName}'`;

  const error = new Error(message) as BulkheadRejectedError;
  error.name = 'BulkheadRejectedError';
  error.serviceName = serviceName;
  error.reason = reason;
  return error;
}

/**
 * Type guard for BulkheadRejectedError.
 */
export function isBulkheadRejectedError(error: unknown): error is BulkheadRejectedError {
  return (
    error instanceof Error &&
    error.name === 'BulkheadRejectedError' &&
    'serviceName' in error &&
    'reason' in error
  );
}

/**
 * Creates a bulkhead for concurrency limiting.
 *
 * @param serviceName - Name of the service (for logging/metrics)
 * @param config - Bulkhead configuration
 * @param events - Optional event callbacks
 */
export function createBulkhead(
  serviceName: string,
  config?: Partial<BulkheadConfig>,
  events?: BulkheadEvents,
): Bulkhead {
  const cfg: BulkheadConfig = { ...DEFAULT_CONFIG, ...config };

  let activeCount = 0;
  const queue: QueuedRequest[] = [];

  const tryDequeue = (): void => {
    if (queue.length === 0 || activeCount >= cfg.maxConcurrent) {
      return;
    }

    const next = queue.shift();
    if (next) {
      clearTimeout(next.timeoutId);
      activeCount++;
      events?.onAcquire?.(serviceName, activeCount, queue.length);
      next.resolve();
    }
  };

  const acquire = (): Promise<void> => {
    // Try to acquire immediately
    if (activeCount < cfg.maxConcurrent) {
      activeCount++;
      events?.onAcquire?.(serviceName, activeCount, queue.length);
      return Promise.resolve();
    }

    // Check if queue is full
    if (queue.length >= cfg.maxQueueSize) {
      events?.onRejected?.(serviceName, 'queue_full');
      return Promise.reject(createBulkheadRejectedError(serviceName, 'queue_full'));
    }

    // Add to queue with timeout
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue
        const index = queue.findIndex((q) => q.resolve === resolve);
        if (index !== -1) {
          queue.splice(index, 1);
        }
        events?.onRejected?.(serviceName, 'queue_timeout');
        reject(createBulkheadRejectedError(serviceName, 'queue_timeout'));
      }, cfg.queueTimeoutMs);

      queue.push({ resolve, reject, timeoutId });
    });
  };

  const release = (): void => {
    activeCount--;
    events?.onRelease?.(serviceName, activeCount, queue.length);
    tryDequeue();
  };

  const execute = async <T>(call: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await call();
    } finally {
      release();
    }
  };

  return {
    execute,
    getActiveCount: () => activeCount,
    getQueueLength: () => queue.length,
    getServiceName: () => serviceName,
  };
}
