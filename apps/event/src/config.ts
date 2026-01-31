import dotenv from 'dotenv';
import { createConfigAccessors, createConfigBuilder } from '@specify-poker/shared';

export type Config = {
  grpcPort: number;
  metricsPort: number;
  databaseUrl: string;
  redisUrl: string;
  logLevel: string;
  otelExporterEndpoint: string;
};

export function loadConfig(): Config {
  dotenv.config();

  const config: Config = createConfigBuilder(process.env)
    .int('grpcPort', 'GRPC_PORT', 50054, { min: 1, max: 65535, onInvalid: 'throw' })
    .int('metricsPort', 'METRICS_PORT', 9104, { min: 1, max: 65535, onInvalid: 'throw' })
    .string('databaseUrl', 'DATABASE_URL', 'postgresql://event:event@event-db:5432/event', {
      onEmpty: 'throw',
    })
    .string('redisUrl', 'REDIS_URL', 'redis://redis:6379', { onEmpty: 'throw' })
    .string('logLevel', 'LOG_LEVEL', 'info', { onEmpty: 'throw' })
    .string('otelExporterEndpoint', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317', {
      onEmpty: 'throw',
    })
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
