import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { context, trace } from '@opentelemetry/api';

export type PinoTimestampPreset = 'isoTime' | 'epochTime' | 'unixTime';

export type CreatePinoLoggerOptions = {
  level: string;
  destination?: DestinationStream;
  includeTraceContext?: boolean;
  timestamp?: LoggerOptions['timestamp'] | PinoTimestampPreset;
  formatters?: LoggerOptions['formatters'];
  base?: LoggerOptions['base'];
  redact?: LoggerOptions['redact'];
  messageKey?: LoggerOptions['messageKey'];
  mixin?: LoggerOptions['mixin'];
};

type MixinResult = Record<string, unknown>;
type PinoMixin = NonNullable<LoggerOptions['mixin']>;

const traceContextMixin: PinoMixin = (): MixinResult => {
  const span = trace.getSpan(context.active());
  if (!span) {
    return {};
  }

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
};

function resolveTimestamp(
  timestamp: CreatePinoLoggerOptions['timestamp'],
): LoggerOptions['timestamp'] | undefined {
  if (timestamp === 'isoTime') {
    return pino.stdTimeFunctions.isoTime;
  }
  if (timestamp === 'epochTime') {
    return pino.stdTimeFunctions.epochTime;
  }
  if (timestamp === 'unixTime') {
    return pino.stdTimeFunctions.unixTime;
  }
  return timestamp;
}

function createMergedMixin(options: CreatePinoLoggerOptions): LoggerOptions['mixin'] | undefined {
  const includeTraceContext = options.includeTraceContext ?? true;
  const baseMixin = options.mixin;

  if (includeTraceContext && baseMixin) {
    const merged: PinoMixin = (...args) => {
      const traceFields = traceContextMixin(...args);
      const baseFields = baseMixin(...args);
      const safeBaseFields =
        baseFields && typeof baseFields === 'object' ? (baseFields as MixinResult) : {};
      return { ...traceFields, ...safeBaseFields };
    };
    return merged;
  }

  if (includeTraceContext) {
    return traceContextMixin;
  }

  return baseMixin;
}

/**
 * Creates a Pino logger with optional OpenTelemetry trace context fields (`traceId`, `spanId`).
 *
 * This is a small facade over Pino to keep logger wiring consistent across services.
 */
export function createPinoLogger(options: CreatePinoLoggerOptions): Logger {
  const mixin = createMergedMixin(options);

  const loggerOptions: LoggerOptions = {
    level: options.level,
    ...(options.formatters ? { formatters: options.formatters } : {}),
    ...(options.base !== undefined ? { base: options.base } : {}),
    ...(options.redact ? { redact: options.redact } : {}),
    ...(options.messageKey ? { messageKey: options.messageKey } : {}),
    ...(options.timestamp !== undefined ? { timestamp: resolveTimestamp(options.timestamp) } : {}),
    ...(mixin ? { mixin } : {}),
  };

  return options.destination ? pino(loggerOptions, options.destination) : pino(loggerOptions);
}
