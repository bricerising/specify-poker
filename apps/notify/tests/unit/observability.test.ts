import { describe, it, expect, vi } from 'vitest';
import { startObservability, stopObservability } from '../../src/observability/index';
import { NodeSDK } from '@opentelemetry/sdk-node';

vi.mock('@opentelemetry/sdk-node', () => {
  return {
    NodeSDK: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn(),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/exporter-metrics-otlp-grpc', () => ({
  OTLPMetricExporter: vi.fn(),
}));

describe('observability', () => {
  it('should start and stop observability', async () => {
    await startObservability();
    expect(NodeSDK).toHaveBeenCalled();

    await stopObservability();
  });
});
