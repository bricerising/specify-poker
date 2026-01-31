import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { createOtelSdkLifecycle } from '@specify-poker/shared';
import logger from './logger';

const lifecycle = createOtelSdkLifecycle({
  logger,
  createSdk: () =>
    new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'gateway-service',
      }),
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    }),
  onShutdownAfterStartError: (err: unknown) => {
    logger.error({ err }, 'Failed to shut down OpenTelemetry SDK after start failure');
  },
});

export function initOTEL() {
  void lifecycle.start().catch(() => {
    // Errors are reported via lifecycle hooks; avoid unhandled rejections.
  });
}

export async function shutdownOTEL() {
  await lifecycle.stop();
}
