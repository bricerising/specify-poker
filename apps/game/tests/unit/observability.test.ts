import { describe, expect, it, vi } from 'vitest';

const sdkState = vi.hoisted(() => ({
  start: vi.fn(),
  shutdown: vi.fn(async () => undefined),
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    start() {
      sdkState.start();
    }
    shutdown() {
      return sdkState.shutdown();
    }
  },
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: () => [],
}));

vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: class {
    constructor(_options: unknown) {}
  },
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: class {
    constructor(_attrs: unknown) {}
  },
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  SemanticResourceAttributes: { SERVICE_NAME: 'service.name' },
}));

vi.mock('../../src/observability/logger', () => ({
  default: { info: vi.fn() },
}));

describe('observability lifecycle', () => {
  it('starts and stops the SDK', async () => {
    const { startObservability, stopObservability } = await import('../../src/observability');

    await startObservability();
    await stopObservability();

    expect(sdkState.start).toHaveBeenCalledTimes(1);
    expect(sdkState.shutdown).toHaveBeenCalledTimes(1);
  });
});
