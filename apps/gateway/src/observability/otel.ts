import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import logger from './logger';

export function initOTEL() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'gateway',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
    ],
  });

  try {
    sdk.start();
    logger.info('OTEL SDK started');
  } catch (err) {
    logger.error({ err }, 'Failed to start OTEL SDK');
  }

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => logger.info('OTEL SDK shut down'))
      .catch((err) => logger.error({ err }, 'Error shutting down OTEL SDK'))
      .finally(() => process.exit(0));
  });
}
