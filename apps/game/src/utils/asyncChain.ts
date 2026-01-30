export type AsyncChainNext<Res> = () => Promise<Res>;

export type AsyncChainHandler<Ctx, Res> = (ctx: Ctx, next: AsyncChainNext<Res>) => Promise<Res>;

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

