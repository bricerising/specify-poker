import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createNodeSdkOtelLifecycle } from '@specify-poker/shared';
import logger from './logger';
import { getObservabilityRuntimeConfig } from './runtimeConfig';

const lifecycle = createNodeSdkOtelLifecycle({
  logger,
  deps: {
    NodeSDK,
    getNodeAutoInstrumentations,
    OTLPTraceExporter,
    Resource,
    SemanticResourceAttributes,
  },
  getRuntimeConfig: () => {
    const config = getObservabilityRuntimeConfig();
    return { serviceName: config.serviceName, otelExporterEndpoint: config.otelExporterEndpoint };
  },
});

export async function startObservability(): Promise<void> {
  await lifecycle.start();
}

export async function stopObservability(): Promise<void> {
  await lifecycle.stop();
}
