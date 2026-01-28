import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getConfig } from '../config';
import logger from './logger';

let sdk: NodeSDK | null = null;

export function startObservability() {
  if (sdk) {
    return;
  }

  const config = getConfig();
  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'balance-service',
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.otelExporterEndpoint,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  logger.info('OpenTelemetry SDK started');
}

export async function stopObservability() {
  if (!sdk) {
    return;
  }

  await sdk.shutdown();
  sdk = null;
  logger.info('OpenTelemetry SDK shut down');
}
