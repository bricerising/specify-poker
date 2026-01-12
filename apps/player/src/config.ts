export interface Config {
  grpcPort: number;
  metricsPort: number;
  databaseUrl: string;
  redisUrl: string | null;
  logLevel: string;
  otelExporterEndpoint: string;
  deletionProcessorIntervalMs: number;
}

export function loadConfig(): Config {
  return {
    grpcPort: parseInt(process.env.GRPC_PORT ?? "50052", 10),
    metricsPort: parseInt(process.env.METRICS_PORT ?? "9106", 10),
    databaseUrl: process.env.DATABASE_URL ?? "postgresql://player:player@player-db:5432/player",
    redisUrl: process.env.REDIS_URL?.trim() || null,
    logLevel: process.env.LOG_LEVEL ?? "info",
    otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4317",
    deletionProcessorIntervalMs: parseInt(process.env.DELETION_PROCESSOR_INTERVAL_MS ?? "3600000", 10), // Default: 1 hour
  };
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}
