/**
 * Async Chain of Responsibility pattern implementation.
 *
 * Composes a series of async handlers into a pipeline where each handler
 * can process the context and decide whether to continue to the next handler.
 *
 * @example
 * ```ts
 * type Context = { userId: string; validated: boolean };
 *
 * const validateHandler: AsyncChainHandler<Context, void> = async (ctx, next) => {
 *   ctx.validated = true;
 *   await next();
 * };
 *
 * const logHandler: AsyncChainHandler<Context, void> = async (ctx, next) => {
 *   console.log(`Processing user ${ctx.userId}`);
 *   await next();
 * };
 *
 * const chain = composeAsyncChain(
 *   [validateHandler, logHandler],
 *   async (ctx) => { console.log('Done'); }
 * );
 *
 * await chain({ userId: '123', validated: false });
 * ```
 */

/** Function to invoke the next handler in the chain */
export type AsyncChainNext<Res> = () => Promise<Res>;

/** A handler in the async chain */
export type AsyncChainHandler<Ctx, Res> = (ctx: Ctx, next: AsyncChainNext<Res>) => Promise<Res>;

/**
 * Composes an array of async handlers into a single function.
 *
 * Each handler receives the context and a `next` function. Calling `next()`
 * invokes the next handler in the chain. The terminal function is called
 * when all handlers have been processed.
 *
 * @param handlers - Array of handlers to compose
 * @param terminal - Final function called after all handlers
 * @returns A function that executes the chain with a given context
 */
export function composeAsyncChain<Ctx, Res>(
  handlers: readonly AsyncChainHandler<Ctx, Res>[],
  terminal: (ctx: Ctx) => Promise<Res>,
): (ctx: Ctx) => Promise<Res> {
  return async (ctx) => {
    let index = -1;

    const dispatch = async (nextIndex: number): Promise<Res> => {
      if (nextIndex <= index) {
        throw new Error('async_chain.next_called_multiple_times');
      }

      index = nextIndex;
      const handler = handlers[nextIndex];
      if (!handler) {
        return terminal(ctx);
      }

      return handler(ctx, () => dispatch(nextIndex + 1));
    };

    return dispatch(0);
  };
}

/**
 * Creates an async chain with dependencies injected into each handler.
 *
 * This is useful when handlers need access to shared services or configuration.
 *
 * @example
 * ```ts
 * type Deps = { logger: Logger; db: Database };
 * type Ctx = { userId: string };
 *
 * const chain = composeAsyncChainWithDeps<Deps, Ctx, void>(
 *   deps => [
 *     async (ctx, next) => {
 *       deps.logger.info(`Processing ${ctx.userId}`);
 *       await next();
 *     },
 *   ],
 *   deps => async (ctx) => {
 *     await deps.db.save(ctx);
 *   }
 * );
 *
 * const execute = chain({ logger, db });
 * await execute({ userId: '123' });
 * ```
 */
export function composeAsyncChainWithDeps<Deps, Ctx, Res>(
  createHandlers: (deps: Deps) => readonly AsyncChainHandler<Ctx, Res>[],
  createTerminal: (deps: Deps) => (ctx: Ctx) => Promise<Res>,
): (deps: Deps) => (ctx: Ctx) => Promise<Res> {
  return (deps) => composeAsyncChain(createHandlers(deps), createTerminal(deps));
}
