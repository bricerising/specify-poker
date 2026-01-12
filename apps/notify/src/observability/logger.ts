import pino from "pino";
import { context, trace } from "@opentelemetry/api";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) {
      return {};
    }
    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  },
});

export default logger;
