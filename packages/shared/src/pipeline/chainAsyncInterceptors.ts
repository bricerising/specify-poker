export type AsyncHandler<TContext, TResult> = (context: TContext) => Promise<TResult>;

export type AsyncInterceptor<TContext, TResult> = (
  context: TContext,
  next: AsyncHandler<TContext, TResult>,
) => Promise<TResult>;

/**
 * Composes a set of interceptors (middleware) around a handler.
 *
 * Interceptors run in array order (first interceptor runs first).
 * Any interceptor may short-circuit by returning without calling `next`.
 */
export function chainAsyncInterceptors<TContext, TResult>(
  handler: AsyncHandler<TContext, TResult>,
  interceptors: ReadonlyArray<AsyncInterceptor<TContext, TResult>>,
): AsyncHandler<TContext, TResult> {
  return interceptors.reduceRight<AsyncHandler<TContext, TResult>>(
    (next, interceptor) => (context) => interceptor(context, next),
    handler,
  );
}
