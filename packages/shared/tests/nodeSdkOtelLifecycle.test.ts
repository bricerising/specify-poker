import { describe, expect, it, vi } from 'vitest';

import { createNodeSdkOtelLifecycle } from '../src/observability/nodeSdkOtelLifecycle';
import type { Attributes } from '@opentelemetry/api';

describe('createNodeSdkOtelLifecycle', () => {
  it('creates a NodeSDK using runtime config (lazily)', async () => {
    const getRuntimeConfig = vi.fn(() => ({
      serviceName: 'my-service',
      otelExporterEndpoint: 'http://collector:4317',
    }));

    const getNodeAutoInstrumentations = vi.fn(() => ({ name: 'auto' }));

    const Resource = vi.fn((attributes: Attributes) => ({ attributes }));
    const OTLPTraceExporter = vi.fn((options: { url: string }) => ({ options }));

    const sdkInstance = { start: vi.fn(), shutdown: vi.fn() };
    let capturedSdkOptions: unknown = null;
    const NodeSDK = vi.fn((options: Record<string, unknown>) => {
      capturedSdkOptions = options;
      return sdkInstance;
    });

    const lifecycle = createNodeSdkOtelLifecycle({
      deps: {
        NodeSDK: NodeSDK as unknown as new (options?: Record<string, unknown>) => typeof sdkInstance,
        getNodeAutoInstrumentations,
        OTLPTraceExporter: OTLPTraceExporter as unknown as new (options: {
          url: string;
        }) => unknown,
        Resource: Resource as unknown as new (attributes: Attributes) => unknown,
        SemanticResourceAttributes: { SERVICE_NAME: 'service.name' },
      },
      getRuntimeConfig,
    });

    expect(getRuntimeConfig).toHaveBeenCalledTimes(0);

    await lifecycle.start();
    await lifecycle.stop();

    expect(getRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(Resource).toHaveBeenCalledWith({ 'service.name': 'my-service' });
    expect(OTLPTraceExporter).toHaveBeenCalledWith({ url: 'http://collector:4317' });

    expect(capturedSdkOptions).toEqual({
      resource: { attributes: { 'service.name': 'my-service' } },
      traceExporter: { options: { url: 'http://collector:4317' } },
      instrumentations: [{ name: 'auto' }],
    });

    expect(sdkInstance.start).toHaveBeenCalledTimes(1);
    expect(sdkInstance.shutdown).toHaveBeenCalledTimes(1);
  });
});
