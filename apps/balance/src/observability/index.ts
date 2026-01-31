import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createNodeSdkOtelLifecycle } from '@specify-poker/shared';
import { getConfig } from '../config';
import logger from './logger';

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
    const config = getConfig();
    return { serviceName: 'balance-service', otelExporterEndpoint: config.otelExporterEndpoint };
  },
});

export async function startObservability(): Promise<void> {
  await lifecycle.start();
}

export async function stopObservability(): Promise<void> {
  await lifecycle.stop();
}
