import type WebSocket from 'ws';
import { context, trace, SpanStatusCode, ROOT_CONTEXT } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import { chainAsyncInterceptors } from '@specify-poker/shared';

import logger from '../observability/logger';
import { safeAsyncHandler } from '../utils/safeAsyncHandler';

export type WsMessageHandler<TMessage> = (message: TMessage) => Promise<void> | void;

export type WsMessageHandlerMap<TMessage extends { type: string }> = {
  [K in TMessage['type']]?: WsMessageHandler<Extract<TMessage, { type: K }>>;
};

export type WsHub<TMessage extends { type: string }> = {
  readonly hubName: string;
  readonly handlers: WsMessageHandlerMap<TMessage>;
  readonly getAttributes?: (message: TMessage) => Record<string, string>;
  readonly onClose?: () => Promise<void>;
};

type WsRouteContext<TMessage extends { type: string }> = {
  readonly hubName: string;
  readonly socket: WebSocket;
  readonly message: TMessage;
  readonly attributes: Record<string, string>;
};

type WsRouteHandler<TMessage extends { type: string }> = (
  ctx: WsRouteContext<TMessage>,
) => Promise<void>;

type WsRouteInterceptor<TMessage extends { type: string }> = (
  ctx: WsRouteContext<TMessage>,
  next: WsRouteHandler<TMessage>,
) => Promise<void>;

type WsRouteEntry<TMessage extends { type: string }> = {
  readonly hubName: string;
  readonly route: WsRouteHandler<TMessage>;
};

function withWsAttributes<TMessage extends { type: string }>(options: {
  getAttributes?: (message: TMessage) => Record<string, string>;
}): WsRouteInterceptor<TMessage> {
  return async (ctx, next) => {
    const getAttributes = options.getAttributes;
    if (!getAttributes) {
      await next(ctx);
      return;
    }

    let extraAttributes: Record<string, string> | null = null;
    try {
      extraAttributes = getAttributes(ctx.message);
    } catch (err: unknown) {
      logger.warn({ err, type: ctx.message.type }, `ws.${ctx.hubName}.attributes.failed`);
    }

    if (!extraAttributes) {
      await next(ctx);
      return;
    }

    await next({
      ...ctx,
      attributes: { ...ctx.attributes, ...extraAttributes },
    });
  };
}

function withWsTracing<TMessage extends { type: string }>(options: {
  tracer: Tracer;
}): WsRouteInterceptor<TMessage> {
  return async (ctx, next) => {
    const span = options.tracer.startSpan(
      `ws.${ctx.hubName}`,
      { attributes: ctx.attributes },
      ROOT_CONTEXT,
    );
    try {
      await context.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
        await next(ctx);
      });
    } catch (err: unknown) {
      span.recordException(err instanceof Error ? err : { message: String(err) });
      const messageText = err instanceof Error ? err.message : 'unknown_error';
      span.setStatus({ code: SpanStatusCode.ERROR, message: messageText });
      context.with(trace.setSpan(ROOT_CONTEXT, span), () => {
        logger.error({ err, type: ctx.message.type }, `ws.${ctx.hubName}.failed`);
      });
    } finally {
      span.end();
    }
  };
}

function dispatchWsMessage<TMessage extends { type: string }>(options: {
  handlers: WsMessageHandlerMap<TMessage>;
}): WsRouteHandler<TMessage> {
  return async (ctx) => {
    const handler = options.handlers[ctx.message.type as TMessage['type']];
    if (!handler) {
      return;
    }
    await (handler as WsMessageHandler<TMessage>)(ctx.message);
  };
}

function createWsRoute<TMessage extends { type: string }>(options: {
  tracer: Tracer;
  handler: WsRouteHandler<TMessage>;
  getAttributes?: (message: TMessage) => Record<string, string>;
}): WsRouteHandler<TMessage> {
  return chainAsyncInterceptors(options.handler, [
    withWsAttributes({ getAttributes: options.getAttributes }),
    withWsTracing({ tracer: options.tracer }),
  ]);
}

export function attachWsRouter<TMessage extends { type: string }>(
  socket: WebSocket,
  options: {
    hubName: string;
    parseMessage: (data: WebSocket.RawData) => TMessage | null;
    getAttributes?: (message: TMessage) => Record<string, string>;
    handlers: WsMessageHandlerMap<TMessage>;
    onClose?: () => Promise<void>;
  },
) {
  const tracer = trace.getTracer('gateway-ws');
  const route = createWsRoute({
    tracer,
    handler: dispatchWsMessage({ handlers: options.handlers }),
    getAttributes: options.getAttributes,
  });

  socket.on(
    'message',
    safeAsyncHandler(
      async (data) => {
        let message: TMessage | null;
        try {
          message = options.parseMessage(data);
        } catch (err: unknown) {
          logger.warn({ err }, `ws.${options.hubName}.parse.failed`);
          return;
        }

        if (!message) {
          return;
        }

        await route({
          hubName: options.hubName,
          socket,
          message,
          attributes: { 'ws.message_type': message.type },
        });
      },
      (err) => {
        logger.error({ err }, `ws.${options.hubName}.unhandled`);
      },
    ),
  );

  socket.on(
    'close',
    safeAsyncHandler(
      async () => {
        await options.onClose?.();
      },
      (err) => {
        logger.error({ err }, `ws.${options.hubName}.close.failed`);
      },
    ),
  );
}

export function attachWsMultiplexRouter<TMessage extends { type: string }>(
  socket: WebSocket,
  options: {
    parseMessage: (data: WebSocket.RawData) => TMessage | null;
    hubs: ReadonlyArray<WsHub<TMessage>>;
    onClose?: () => Promise<void>;
  },
): void {
  const tracer = trace.getTracer('gateway-ws');

  const routesByType = new Map<string, WsRouteEntry<TMessage>>();
  for (const hub of options.hubs) {
    const handlers = hub.handlers as Record<string, WsMessageHandler<TMessage> | undefined>;
    for (const [type, handler] of Object.entries(handlers)) {
      if (!handler) {
        continue;
      }
      if (routesByType.has(type)) {
        throw new Error(`Duplicate ws handler registered for "${type}"`);
      }

      routesByType.set(type, {
        hubName: hub.hubName,
        route: createWsRoute({
          tracer,
          getAttributes: hub.getAttributes,
          handler: async (ctx) => {
            await handler(ctx.message);
          },
        }),
      });
    }
  }

  socket.on(
    'message',
    safeAsyncHandler(
      async (data) => {
        let message: TMessage | null;
        try {
          message = options.parseMessage(data);
        } catch (err: unknown) {
          logger.warn({ err }, 'ws.multiplex.parse.failed');
          return;
        }

        if (!message) {
          return;
        }

        const entry = routesByType.get(message.type);
        if (!entry) {
          return;
        }

        await entry.route({
          hubName: entry.hubName,
          socket,
          message,
          attributes: {
            'ws.hub': entry.hubName,
            'ws.message_type': message.type,
          },
        });
      },
      (err) => {
        logger.error({ err }, 'ws.multiplex.unhandled');
      },
    ),
  );

  const closeTasks: Array<{ name: string; run: () => Promise<void> }> = [];
  for (const hub of options.hubs) {
    if (hub.onClose) {
      closeTasks.push({ name: `ws.${hub.hubName}.close`, run: hub.onClose });
    }
  }
  if (options.onClose) {
    closeTasks.push({ name: 'ws.close', run: options.onClose });
  }

  if (closeTasks.length > 0) {
    socket.on(
      'close',
      safeAsyncHandler(
        async () => {
          for (const task of closeTasks) {
            try {
              await task.run();
            } catch (err: unknown) {
              logger.error({ err }, `${task.name}.failed`);
            }
          }
        },
        (err) => {
          logger.error({ err }, 'ws.multiplex.close.unhandled');
        },
      ),
    );
  }
}
