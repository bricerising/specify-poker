import { describe, it, expect, beforeEach, vi } from 'vitest';

const start = vi.fn();
const shutdown = vi.fn();

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn(() => ({
    start,
    shutdown,
  })),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: vi.fn(() => ({})),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn(() => ({})),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  SemanticResourceAttributes: { SERVICE_NAME: 'service.name' },
}));

vi.mock('../../src/config', () => ({
  getConfig: () => ({
    otelExporterEndpoint: 'http://localhost:4317',
  }),
}));

vi.mock('../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
  },
}));

describe('observability lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts and stops the OpenTelemetry SDK', async () => {
    const observability = await import('../../src/observability');

    observability.startObservability();
    await observability.stopObservability();

    expect(start).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalled();
  });
});
