import dotenv from 'dotenv';
import { createConfigAccessors, createConfigBuilder } from '@specify-poker/shared';

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
  dotenv.config();

  const config: Config = createConfigBuilder(process.env)
    .int('grpcPort', 'GRPC_PORT', 50052, { min: 1, max: 65535 })
    .int('metricsPort', 'METRICS_PORT', 9106, { min: 1, max: 65535 })
    .string('databaseUrl', 'DATABASE_URL', 'postgresql://player:player@player-db:5432/player')
    .nullableString('redisUrl', 'REDIS_URL')
    .string('logLevel', 'LOG_LEVEL', 'info')
    .string('otelExporterEndpoint', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317')
    .int('deletionProcessorIntervalMs', 'DELETION_PROCESSOR_INTERVAL_MS', 3_600_000, { min: 0 })
    .build();

  return config;
}

const configAccessors = createConfigAccessors(loadConfig);

export function getConfig(): Config {
  return configAccessors.getConfig();
}

export function resetConfigForTests(): void {
  configAccessors.resetConfigForTests();
}
