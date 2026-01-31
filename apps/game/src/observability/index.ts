import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createOtelSdkLifecycle } from '@specify-poker/shared';
import { getConfig } from '../config';
import logger from './logger';

const lifecycle = createOtelSdkLifecycle({
  createSdk: () => {
    const config = getConfig();
    return new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'game-service',
      }),
      traceExporter: new OTLPTraceExporter({
        url: config.otelExporterEndpoint,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
  },
  onStarted: () => {
    logger.info('OpenTelemetry SDK started');
  },
  onStopped: () => {
    logger.info('OpenTelemetry SDK shut down');
  },
});

export async function startObservability(): Promise<void> {
  await lifecycle.start();
}

export async function stopObservability(): Promise<void> {
  await lifecycle.stop();
}
