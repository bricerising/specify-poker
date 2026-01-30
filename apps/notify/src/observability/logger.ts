import pino from 'pino';
import { context, trace } from '@opentelemetry/api';
import { getObservabilityRuntimeConfig } from './runtimeConfig';

const { logLevel } = getObservabilityRuntimeConfig();

const logger = pino({
  level: logLevel,
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
