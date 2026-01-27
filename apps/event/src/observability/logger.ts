import pino from "pino";
import { context, trace } from "@opentelemetry/api";
import { config } from "../config";

const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : config.logLevel,
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
