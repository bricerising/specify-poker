import WebSocket from "ws";
import { context, trace, SpanStatusCode, ROOT_CONTEXT } from "@opentelemetry/api";

import logger from "../observability/logger";
import { safeAsyncHandler } from "../utils/safeAsyncHandler";

export type WsMessageHandler<TMessage> = (message: TMessage) => Promise<void> | void;

export type WsMessageHandlerMap<TMessage extends { type: string }> = Partial<{
  [K in TMessage["type"]]: WsMessageHandler<Extract<TMessage, { type: K }>>;
}>;

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
  const tracer = trace.getTracer("gateway-ws");

  socket.on(
    "message",
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

        let extraAttributes: Record<string, string> = {};
        if (options.getAttributes) {
          try {
            extraAttributes = options.getAttributes(message);
          } catch (err: unknown) {
            logger.warn({ err, type: message.type }, `ws.${options.hubName}.attributes.failed`);
          }
        }

        const attributes: Record<string, string> = {
          "ws.message_type": message.type,
          ...extraAttributes,
        };

        const span = tracer.startSpan(`ws.${options.hubName}`, { attributes }, ROOT_CONTEXT);
        try {
          await context.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
            const handler = options.handlers[message.type as TMessage["type"]] as
              | WsMessageHandler<TMessage>
              | undefined;
            if (!handler) {
              return;
            }
            await handler(message);
          });
        } catch (err: unknown) {
          span.recordException(err instanceof Error ? err : { message: String(err) });
          const messageText = err instanceof Error ? err.message : "unknown_error";
          span.setStatus({ code: SpanStatusCode.ERROR, message: messageText });
          context.with(trace.setSpan(ROOT_CONTEXT, span), () => {
            logger.error({ err, type: message.type }, `ws.${options.hubName}.failed`);
          });
        } finally {
          span.end();
        }
      },
      (err) => {
        logger.error({ err }, `ws.${options.hubName}.unhandled`);
      },
    ),
  );

  socket.on(
    "close",
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
