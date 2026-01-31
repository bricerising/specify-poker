import { Writable } from 'node:stream';
import { context, trace, type Span, type SpanContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import type { DestinationStream } from 'pino';

import { createPinoLogger } from '../src/observability/pinoLogger';

function createMemoryDestination(): { destination: DestinationStream; lines: string[] } {
  const lines: string[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { destination: writable as unknown as DestinationStream, lines };
}

describe('createPinoLogger', () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  });

  afterAll(() => {
    context.disable();
  });

  it('adds trace context fields when a span is active', () => {
    const { destination, lines } = createMemoryDestination();
    const logger = createPinoLogger({ level: 'info', destination, base: null, timestamp: false });

    const expectedSpanContext: SpanContext = {
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spanId: 'bbbbbbbbbbbbbbbb',
      traceFlags: 1,
    };

    const span = { spanContext: () => expectedSpanContext } as unknown as Span;
    const ctx = trace.setSpan(context.active(), span);

    context.with(ctx, () => {
      logger.info('hello');
    });

    const log = JSON.parse(lines.join('').trim()) as Record<string, unknown>;
    expect(log.traceId).toBe(expectedSpanContext.traceId);
    expect(log.spanId).toBe(expectedSpanContext.spanId);
  });

  it('omits trace context fields when no span is active', () => {
    const { destination, lines } = createMemoryDestination();
    const logger = createPinoLogger({ level: 'info', destination, base: null, timestamp: false });

    logger.info('hello');

    const log = JSON.parse(lines.join('').trim()) as Record<string, unknown>;
    expect(log.traceId).toBeUndefined();
    expect(log.spanId).toBeUndefined();
  });

  it('supports timestamp presets', () => {
    const { destination, lines } = createMemoryDestination();
    const logger = createPinoLogger({ level: 'info', destination, base: null, timestamp: 'isoTime' });

    logger.info('hello');

    const log = JSON.parse(lines.join('').trim()) as Record<string, unknown>;
    expect(typeof log.time).toBe('string');
  });
});

