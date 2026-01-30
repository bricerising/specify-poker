import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createAsyncLifecycle } from '@specify-poker/shared';
import logger from './logger';
import { getObservabilityRuntimeConfig } from './runtimeConfig';

let sdk: NodeSDK | null = null;

function getSdk(): NodeSDK {
  if (sdk) {
    return sdk;
  }

  const config = getObservabilityRuntimeConfig();
  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.otelExporterEndpoint,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  return sdk;
}

const lifecycle = createAsyncLifecycle({
  start: async () => {
    const currentSdk = getSdk();
    try {
      await currentSdk.start();
      logger.info('OpenTelemetry SDK started');
    } catch (error: unknown) {
      try {
        await currentSdk.shutdown();
      } catch {}
      sdk = null;
      throw error;
    }
  },
  stop: async () => {
    if (!sdk) {
      return;
    }

    const currentSdk = sdk;
    await currentSdk.shutdown();
    logger.info('OpenTelemetry SDK shut down');

    sdk = null;
  },
});

export async function startObservability(): Promise<void> {
  await lifecycle.start();
}

export async function stopObservability(): Promise<void> {
  await lifecycle.stop();
}
