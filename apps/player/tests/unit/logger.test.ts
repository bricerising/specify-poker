import { describe, it, expect, beforeEach, vi } from 'vitest';

const getSpan = vi.fn();
const active = vi.fn();

vi.mock('@opentelemetry/api', () => ({
  context: { active },
  trace: { getSpan },
}));

vi.mock('pino', () => ({
  default: (opts: { mixin: () => Record<string, string> }) => ({
    mixin: opts.mixin,
  }),
}));

vi.mock('../../src/config', () => ({
  getConfig: () => ({
    logLevel: 'info',
  }),
}));

describe('logger mixin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty context when no active span', async () => {
    active.mockReturnValue({});
    getSpan.mockReturnValue(null);

    const logger = await import('../../src/observability/logger');

    expect(logger.default.mixin()).toEqual({});
  });

  it('includes trace ids when a span is active', async () => {
    active.mockReturnValue({});
    getSpan.mockReturnValue({
      spanContext: () => ({ traceId: 'trace-1', spanId: 'span-1' }),
    });

    const logger = await import('../../src/observability/logger');

    expect(logger.default.mixin()).toEqual({ traceId: 'trace-1', spanId: 'span-1' });
  });
});
