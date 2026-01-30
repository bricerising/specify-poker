export type ObservabilityRuntimeConfig = {
  logLevel: string;
  otelExporterEndpoint: string;
  serviceName: string;
};

export function getObservabilityRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ObservabilityRuntimeConfig {
  return {
    logLevel: env.LOG_LEVEL ?? 'info',
    otelExporterEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
    serviceName: env.OTEL_SERVICE_NAME ?? 'notify-service',
  };
}

