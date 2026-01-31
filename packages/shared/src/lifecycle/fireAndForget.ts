export type FireAndForgetErrorHandler = (error: unknown) => void;

/**
 * Runs async work without awaiting it, ensuring any thrown/rejected errors are handled.
 *
 * Use for background tasks where the caller intentionally does not await completion.
 * Prefer logging or reporting errors via `onError` so failures aren't silent.
 */
export function fireAndForget(work: () => Promise<unknown>, onError: FireAndForgetErrorHandler): void {
  try {
    void Promise.resolve(work()).catch(onError);
  } catch (error: unknown) {
    onError(error);
  }
}
