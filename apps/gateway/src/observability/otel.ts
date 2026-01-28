import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import logger from './logger';

let sdk: NodeSDK | null = null;

export function initOTEL() {
  if (sdk) {
    return;
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'gateway-service',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  try {
    const maybePromise = sdk.start() as unknown;
    if (maybePromise && typeof (maybePromise as PromiseLike<void>).then === 'function') {
      void (maybePromise as PromiseLike<void>).then(
        () => {
          logger.info('OpenTelemetry SDK started');
        },
        (err: unknown) => {
          logger.error({ err }, 'Failed to start OpenTelemetry SDK');
        },
      );
      return;
    }
    logger.info('OpenTelemetry SDK started');
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to start OpenTelemetry SDK');
  }
}

export async function shutdownOTEL() {
  if (!sdk) {
    return;
  }
  try {
    await sdk.shutdown();
    logger.info('OpenTelemetry SDK shut down');
  } finally {
    sdk = null;
  }
}
