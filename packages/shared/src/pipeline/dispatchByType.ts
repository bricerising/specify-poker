export type DiscriminatedUnion<Type extends string = string> = { readonly type: Type };

export type DispatchByTypeHandlerMap<
  Ctx,
  Event extends DiscriminatedUnion,
  Return = void,
> = {
  readonly [Type in Event['type']]: (
    ctx: Ctx,
    event: Extract<Event, { type: Type }>,
  ) => Return;
};

export type DispatchByTypeNoCtxHandlerMap<Event extends DiscriminatedUnion, Return = void> = {
  readonly [Type in Event['type']]: (event: Extract<Event, { type: Type }>) => Return;
};

export function dispatchByType<Ctx, Event extends DiscriminatedUnion, Return>(
  handlers: DispatchByTypeHandlerMap<Ctx, Event, Return>,
  ctx: Ctx,
  event: Event,
): Return {
  const handler = handlers[event.type as keyof typeof handlers] as
    | ((ctx: Ctx, event: Event) => Return)
    | undefined;
  if (!handler) {
    throw new Error(`dispatchByType.missing_handler:${event.type}`);
  }
  return handler(ctx, event);
}

export function dispatchByTypeNoCtx<Event extends DiscriminatedUnion, Return>(
  handlers: DispatchByTypeNoCtxHandlerMap<Event, Return>,
  event: Event,
): Return {
  const handler = handlers[event.type as keyof typeof handlers] as
    | ((event: Event) => Return)
    | undefined;
  if (!handler) {
    throw new Error(`dispatchByTypeNoCtx.missing_handler:${event.type}`);
  }
  return handler(event);
}
