import dotenv from 'dotenv';
import { createConfigBuilder } from '@specify-poker/shared';

dotenv.config();

export interface Config {
  grpcPort: number;
  metricsPort: number;
  redisUrl: string;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string;
  eventStreamKey: string;
  logLevel: string;
  otelExporterEndpoint: string;
}

export function loadConfig(): Config {
  const config: Config = createConfigBuilder(process.env)
    .int('grpcPort', 'GRPC_PORT', 50055, { min: 1, max: 65535, onInvalid: 'throw' })
    .int('metricsPort', 'METRICS_PORT', 9105, { min: 1, max: 65535, onInvalid: 'throw' })
    .string('redisUrl', 'REDIS_URL', 'redis://localhost:6379')
    .nullableString('vapidPublicKey', 'VAPID_PUBLIC_KEY')
    .nullableString('vapidPrivateKey', 'VAPID_PRIVATE_KEY')
    .string('vapidSubject', 'VAPID_SUBJECT', 'mailto:admin@example.com')
    .string('eventStreamKey', 'EVENT_STREAM_KEY', 'events:game')
    .string('logLevel', 'LOG_LEVEL', 'info')
    .string('otelExporterEndpoint', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317')
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
