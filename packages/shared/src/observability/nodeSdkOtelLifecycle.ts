import type { AsyncLifecycle } from '../lifecycle/asyncLifecycle';
import {
  createOtelSdkLifecycle,
  type OtelSdkLike,
  type OtelSdkLifecycleLogger,
} from './otelSdkLifecycle';
import type { Attributes } from '@opentelemetry/api';

export type NodeOtelRuntimeConfig = {
  serviceName: string;
  otelExporterEndpoint: string;
};

export type NodeOtelSdkDeps = {
  // Dependency injection types are intentionally loose to avoid hard-depending
  // on the Node OTel SDK packages from `@specify-poker/shared`.
  NodeSDK: new (options?: Record<string, unknown>) => OtelSdkLike;
  getNodeAutoInstrumentations: () => unknown;
  OTLPTraceExporter: new (options: { url: string }) => unknown;
  Resource: new (attributes: Attributes) => unknown;
  SemanticResourceAttributes: { SERVICE_NAME: string };
};

/**
 * Factory function: creates an OpenTelemetry SDK lifecycle for Node services
 * based on the `@opentelemetry/sdk-node` NodeSDK.
 *
 * Dependencies are injected (constructors/functions) so `@specify-poker/shared`
 * does not take a hard dependency on the Node OTel packages.
 */
export function createNodeSdkOtelLifecycle(options: {
  deps: NodeOtelSdkDeps;
  getRuntimeConfig: () => NodeOtelRuntimeConfig;
  logger?: OtelSdkLifecycleLogger;
  onShutdownAfterStartError?: (error: unknown) => void;
}): AsyncLifecycle {
  return createOtelSdkLifecycle({
    logger: options.logger,
    onShutdownAfterStartError: options.onShutdownAfterStartError,
    createSdk: () => {
      const config = options.getRuntimeConfig();
      return new options.deps.NodeSDK({
        resource: new options.deps.Resource({
          [options.deps.SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        }),
        traceExporter: new options.deps.OTLPTraceExporter({
          url: config.otelExporterEndpoint,
        }),
        instrumentations: [options.deps.getNodeAutoInstrumentations()],
      });
    },
  });
}
