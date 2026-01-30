import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getConfig } from '../config';
import logger from './logger';

let sdk: NodeSDK | null = null;
let isStarted = false;

function getSdk(): NodeSDK {
  if (sdk) {
    return sdk;
  }

  const config = getConfig();

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'player-service',
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.otelExporterEndpoint,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  return sdk;
}

export function startObservability() {
  if (isStarted) {
    return;
  }
  getSdk().start();
  isStarted = true;
  logger.info('OpenTelemetry SDK started');
}

export async function stopObservability() {
  if (!sdk || !isStarted) {
    sdk = null;
    isStarted = false;
    return;
  }

  await sdk.shutdown();
  sdk = null;
  isStarted = false;
  logger.info('OpenTelemetry SDK shut down');
}
