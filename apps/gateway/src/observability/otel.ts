import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { createNodeSdkOtelLifecycle } from '@specify-poker/shared';
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
  getRuntimeConfig: () => ({
    serviceName: 'gateway-service',
    otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  }),
  onShutdownAfterStartError: (err: unknown) => {
    logger.error({ err }, 'Failed to shut down OpenTelemetry SDK after start failure');
  },
});

export async function initOTEL(): Promise<void> {
  await lifecycle.start();
}

export async function shutdownOTEL(): Promise<void> {
  await lifecycle.stop();
}
