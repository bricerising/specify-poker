/**
 * Simple Observer pattern implementation for typed event notifications.
 *
 * @example
 * const subject = createSubject<{ status: 'success' | 'failure'; userId: string }>();
 *
 * // Subscribe observers
 * const unsubMetrics = subject.subscribe(({ status }) => recordMetric(status));
 * const unsubAudit = subject.subscribe(({ status, userId }) => auditLog(userId, status));
 *
 * // Notify all observers
 * await subject.notify({ status: 'success', userId: 'u1' });
 *
 * // Cleanup
 * unsubMetrics();
 */

export type Observer<T> = (event: T) => void | Promise<void>;

export type Unsubscribe = () => void;

export type Subject<T> = {
  /** Subscribe an observer to receive notifications. Returns an unsubscribe function. */
  subscribe(observer: Observer<T>): Unsubscribe;

  /** Notify all observers. Awaits all async observers. Errors are caught and reported via onError. */
  notify(event: T): Promise<void>;

  /** Returns the current number of subscribed observers. */
  size(): number;
};

export type SubjectOptions<T> = {
  /** Called when an observer throws. Defaults to console.error. */
  onError?: (error: unknown, event: T) => void;
};

/**
 * Create a subject that can be observed.
 * Observers are notified in subscription order.
 * All observers are awaited (Promise.allSettled) on notify.
 */
export function createSubject<T>(options: SubjectOptions<T> = {}): Subject<T> {
  const observers = new Set<Observer<T>>();
  const onError = options.onError ?? ((err) => console.error('Observer error:', err));

  return {
    subscribe(observer) {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },

    async notify(event) {
      // Wrap each observer call to ensure synchronous throws are converted
      // to rejected promises that Promise.allSettled can handle
      const safeCall = (observer: Observer<T>): Promise<void> => {
        try {
          const result = observer(event);
          return result instanceof Promise ? result : Promise.resolve();
        } catch (err) {
          return Promise.reject(err);
        }
      };

      const results = await Promise.allSettled(Array.from(observers).map(safeCall));

      for (const result of results) {
        if (result.status === 'rejected') {
          onError(result.reason, event);
        }
      }
    },

    size() {
      return observers.size;
    },
  };
}
