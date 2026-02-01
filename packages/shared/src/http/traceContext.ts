/**
 * Trace context extraction utilities.
 *
 * Extracts trace IDs from OpenTelemetry context or W3C Trace Context headers.
 *
 * @example
 * ```ts
 * import { getActiveTraceId, parseTraceparentHeader } from '@specify-poker/shared';
 *
 * // From OTel context (if available)
 * const traceId = getActiveTraceId();
 *
 * // From HTTP header
 * const traceId = parseTraceparentHeader(req.headers.traceparent);
 * ```
 */

/**
 * Attempts to get the trace ID from the active OpenTelemetry span context.
 * Returns undefined if no active span exists.
 */
import { context, trace } from '@opentelemetry/api';

export function getActiveTraceId(): string | undefined {
  try {
    const span = trace.getSpan(context.active());
    if (!span) {
      return undefined;
    }

    const spanContext = span.spanContext();
    if (!spanContext || !spanContext.traceId) {
      return undefined;
    }

    // Return undefined for invalid (all-zero) trace IDs
    if (spanContext.traceId === '00000000000000000000000000000000') {
      return undefined;
    }

    return spanContext.traceId;
  } catch {
    // OTel not available or error accessing context
    return undefined;
  }
}

/**
 * Gets the active span ID from OpenTelemetry context.
 */
export function getActiveSpanId(): string | undefined {
  try {
    const span = trace.getSpan(context.active());
    if (!span) {
      return undefined;
    }

    const spanContext = span.spanContext();
    if (!spanContext || !spanContext.spanId) {
      return undefined;
    }

    // Return undefined for invalid (all-zero) span IDs
    if (spanContext.spanId === '0000000000000000') {
      return undefined;
    }

    return spanContext.spanId;
  } catch {
    return undefined;
  }
}

/**
 * Parses a W3C Trace Context traceparent header to extract the trace ID.
 *
 * Format: 00-<trace-id>-<span-id>-<flags>
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 *
 * @param header - The traceparent header value
 * @returns The trace ID or undefined if header is invalid
 */
export function parseTraceparentHeader(header: string | undefined): string | undefined {
  if (!header || typeof header !== 'string') {
    return undefined;
  }

  // W3C Trace Context format: version-traceId-spanId-flags
  const parts = header.trim().split('-');

  // Must have exactly 4 parts
  if (parts.length !== 4) {
    return undefined;
  }

  const [version, traceId, , ] = parts;

  // Version must be "00" (current version) or a valid hex pair
  if (!/^[0-9a-f]{2}$/i.test(version)) {
    return undefined;
  }

  // Trace ID must be 32 hex characters
  if (!/^[0-9a-f]{32}$/i.test(traceId)) {
    return undefined;
  }

  // Return undefined for invalid (all-zero) trace IDs
  if (traceId === '00000000000000000000000000000000') {
    return undefined;
  }

  return traceId.toLowerCase();
}

/**
 * Gets trace context from either OTel or traceparent header.
 * Prefers OTel context if available.
 */
export function getTraceId(traceparentHeader?: string): string | undefined {
  // Try OTel context first
  const otelTraceId = getActiveTraceId();
  if (otelTraceId) {
    return otelTraceId;
  }

  // Fall back to header parsing
  return parseTraceparentHeader(traceparentHeader);
}

/**
 * Back-compat no-op (used to reset a now-removed dynamic import cache).
 */
export function resetOtelApiCache(): void {
  // no-op
}
