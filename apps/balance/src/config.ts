import dotenv from 'dotenv';
import { createConfigAccessors, createConfigBuilder } from '@specify-poker/shared';

export interface Config {
  httpPort: number;
  grpcPort: number;
  metricsPort: number;
  redisUrl: string | null;
  reservationTimeoutMs: number;
  idempotencyTtlMs: number;
  idempotencyCacheMaxEntries: number;
  reservationExpiryIntervalMs: number;
  ledgerVerificationIntervalMs: number;
  rakeBasisPoints: number;
  rakeCapChips: number;
  rakeMinPotChips: number;
  logLevel: string;
  otelExporterEndpoint: string;
  jwtSecret: string;
}

export function loadConfig(): Config {
  dotenv.config();

  const config: Config = createConfigBuilder(process.env)
    .int('httpPort', 'HTTP_PORT', 3002, { min: 1, max: 65535 })
    .int('grpcPort', 'GRPC_PORT', 50051, { min: 1, max: 65535 })
    .int('metricsPort', 'METRICS_PORT', 9102, { min: 1, max: 65535 })
    .nullableString('redisUrl', 'REDIS_URL')
    .int('reservationTimeoutMs', 'RESERVATION_TIMEOUT_MS', 30000, { min: 0 })
    .int('idempotencyTtlMs', 'IDEMPOTENCY_TTL_MS', 86_400_000, { min: 0 })
    .int('idempotencyCacheMaxEntries', 'IDEMPOTENCY_CACHE_MAX_ENTRIES', 100_000, { min: 0 })
    .int('reservationExpiryIntervalMs', 'RESERVATION_EXPIRY_INTERVAL_MS', 5000, { min: 0 })
    .int('ledgerVerificationIntervalMs', 'LEDGER_VERIFICATION_INTERVAL_MS', 60000, { min: 0 })
    .int('rakeBasisPoints', 'RAKE_BASIS_POINTS', 500, { min: 0, max: 10_000 })
    .int('rakeCapChips', 'RAKE_CAP_CHIPS', 5, { min: 0 })
    .int('rakeMinPotChips', 'RAKE_MIN_POT_CHIPS', 20, { min: 0 })
    .string('logLevel', 'LOG_LEVEL', 'info')
    .string('otelExporterEndpoint', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317')
    // NOTE: HS256 secrets must be explicitly configured (prefer Keycloak RS256).
    .string('jwtSecret', ['JWT_HS256_SECRET', 'JWT_SECRET'], '')
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
