import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdkInstance = {
  start: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn(() => sdkInstance),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn(),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  SemanticResourceAttributes: { SERVICE_NAME: 'service.name' },
}));

vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('../../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OTEL init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    sdkInstance.start.mockReset();
    sdkInstance.shutdown.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {});

  it('starts SDK once', async () => {
    sdkInstance.start.mockResolvedValue(undefined);
    const { initOTEL } = await import('../../../src/observability/otel');
    initOTEL();

    expect(sdkInstance.start).toHaveBeenCalled();
  });

  it('logs errors when SDK fails to start', async () => {
    sdkInstance.start.mockRejectedValue(new Error('failed'));
    const logger = (await import('../../../src/observability/logger')).default;
    const { initOTEL } = await import('../../../src/observability/otel');
    initOTEL();

    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalled();
  });

  it('shuts down SDK when requested', async () => {
    sdkInstance.start.mockResolvedValue(undefined);
    const { initOTEL, shutdownOTEL } = await import('../../../src/observability/otel');
    initOTEL();

    await shutdownOTEL();
    expect(sdkInstance.shutdown).toHaveBeenCalled();
  });
});
