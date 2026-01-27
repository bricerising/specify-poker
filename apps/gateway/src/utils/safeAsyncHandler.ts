export type AsyncHandler<TArgs extends unknown[]> = (...args: TArgs) => Promise<void> | void;

export function safeAsyncHandler<TArgs extends unknown[]>(
  handler: AsyncHandler<TArgs>,
  onError: (error: unknown, ...args: TArgs) => void,
): (...args: TArgs) => Promise<void> {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      try {
        onError(error, ...args);
      } catch {
        // Avoid cascading failures from error handlers.
      }
    }
  };
}
