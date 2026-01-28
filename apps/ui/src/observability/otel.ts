import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

let initialized = false;

export function initUiTelemetry() {
  if (initialized) {
    return;
  }

  const provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  initialized = true;
}

export function recordNavigation(path: string) {
  const tracer = trace.getTracer('ui');
  const span = tracer.startSpan('ui.navigation', {
    attributes: {
      'ui.path': path,
    },
  });
  span.end();
}

export function recordAction(
  actionType: string,
  attributes?: Record<string, string | number | boolean>,
) {
  const tracer = trace.getTracer('ui');
  const span = tracer.startSpan(`ui.action.${actionType}`, {
    attributes: {
      'ui.action_type': actionType,
      ...attributes,
    },
  });
  span.end();
}

export function recordError(
  error: Error | string,
  context?: Record<string, string | number | boolean>,
) {
  const tracer = trace.getTracer('ui');
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? undefined : error.stack;

  const span = tracer.startSpan('ui.error', {
    attributes: {
      'error.message': errorMessage,
      ...(errorStack ? { 'error.stack': errorStack } : {}),
      ...context,
    },
  });
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
  span.end();
}

export function recordApiCall(
  endpoint: string,
  method: string,
  statusCode?: number,
  durationMs?: number,
) {
  const tracer = trace.getTracer('ui');
  const span = tracer.startSpan('ui.api_call', {
    attributes: {
      'http.url': endpoint,
      'http.method': method,
      ...(statusCode !== undefined ? { 'http.status_code': statusCode } : {}),
      ...(durationMs !== undefined ? { 'http.duration_ms': durationMs } : {}),
    },
  });
  if (statusCode && statusCode >= 400) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${statusCode}` });
  }
  span.end();
}

export function recordWebSocketMessage(
  messageType: string,
  direction: 'sent' | 'received',
  tableId?: string,
) {
  const tracer = trace.getTracer('ui');
  const span = tracer.startSpan(`ui.ws.${direction}`, {
    attributes: {
      'ws.message_type': messageType,
      'ws.direction': direction,
      ...(tableId ? { 'poker.table_id': tableId } : {}),
    },
  });
  span.end();
}
