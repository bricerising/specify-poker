import { createConfigBuilder } from "@specify-poker/shared";

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
  const config: Config = createConfigBuilder(process.env)
    .int("grpcPort", "GRPC_PORT", 50052, { min: 1, max: 65535 })
    .int("metricsPort", "METRICS_PORT", 9106, { min: 1, max: 65535 })
    .string("databaseUrl", "DATABASE_URL", "postgresql://player:player@player-db:5432/player")
    .nullableString("redisUrl", "REDIS_URL")
    .string("logLevel", "LOG_LEVEL", "info")
    .string("otelExporterEndpoint", "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    .int("deletionProcessorIntervalMs", "DELETION_PROCESSOR_INTERVAL_MS", 3_600_000, { min: 0 })
    .build();

  return config;
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

export function resetConfigForTests(): void {
  config = null;
}
