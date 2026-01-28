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
  const route = chainAsyncInterceptors(dispatchWsMessage({ handlers: options.handlers }), [
    withWsAttributes({ getAttributes: options.getAttributes }),
    withWsTracing({ tracer }),
  ]);

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
