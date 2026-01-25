import WebSocket from "ws";
import { context, trace, SpanStatusCode, ROOT_CONTEXT } from "@opentelemetry/api";

import logger from "../observability/logger";

export type WsMessageHandler<TMessage> = (message: TMessage) => Promise<void> | void;

export function attachWsRouter<TMessage extends { type: string }>(
  socket: WebSocket,
  options: {
    hubName: string;
    parseMessage: (data: WebSocket.RawData) => TMessage | null;
    getAttributes?: (message: TMessage) => Record<string, string>;
    handlers: Partial<Record<TMessage["type"], WsMessageHandler<TMessage>>>;
    onClose?: () => Promise<void>;
  },
) {
  const tracer = trace.getTracer("gateway-ws");

  socket.on("message", async (data) => {
    const message = options.parseMessage(data);
    if (!message) {
      return;
    }

    const attributes: Record<string, string> = {
      "ws.message_type": message.type,
      ...(options.getAttributes ? options.getAttributes(message) : {}),
    };

    const span = tracer.startSpan(`ws.${options.hubName}`, { attributes }, ROOT_CONTEXT);
    try {
      await context.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
        const handler = options.handlers[message.type] as WsMessageHandler<TMessage> | undefined;
        if (!handler) {
          return;
        }
        await handler(message);
      });
    } catch (err: unknown) {
      span.recordException(err as Error);
      const messageText = err instanceof Error ? err.message : "unknown_error";
      span.setStatus({ code: SpanStatusCode.ERROR, message: messageText });
      context.with(trace.setSpan(ROOT_CONTEXT, span), () => {
        logger.error({ err, type: message.type }, `ws.${options.hubName}.failed`);
      });
    } finally {
      span.end();
    }
  });

  socket.on("close", async () => {
    if (options.onClose) {
      await options.onClose();
    }
  });
}

