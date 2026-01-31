import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createOtelSdkLifecycle } from '@specify-poker/shared';
import logger from './logger';
import { getObservabilityRuntimeConfig } from './runtimeConfig';

const lifecycle = createOtelSdkLifecycle({
  createSdk: () => {
    const config = getObservabilityRuntimeConfig();
    return new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
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
  onShutdownAfterStartError: (shutdownError: unknown) => {
    logger.warn(
      { err: shutdownError },
      'OpenTelemetry SDK shutdown failed after start error',
    );
  },
});

export async function startObservability(): Promise<void> {
  await lifecycle.start();
}

export async function stopObservability(): Promise<void> {
  await lifecycle.stop();
}
