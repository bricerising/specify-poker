import dotenv from "dotenv";
import { createConfigBuilder } from "@specify-poker/shared";

dotenv.config();

export interface Config {
  httpPort: number;
  grpcPort: number;
  metricsPort: number;
  redisUrl: string | null;
  reservationTimeoutMs: number;
  idempotencyTtlMs: number;
  reservationExpiryIntervalMs: number;
  ledgerVerificationIntervalMs: number;
  logLevel: string;
  otelExporterEndpoint: string;
  jwtSecret: string;
}

export function loadConfig(): Config {
  const config: Config = createConfigBuilder(process.env)
    .int("httpPort", "HTTP_PORT", 3002, { min: 1, max: 65535 })
    .int("grpcPort", "GRPC_PORT", 50051, { min: 1, max: 65535 })
    .int("metricsPort", "METRICS_PORT", 9102, { min: 1, max: 65535 })
    .nullableString("redisUrl", "REDIS_URL")
    .int("reservationTimeoutMs", "RESERVATION_TIMEOUT_MS", 30000, { min: 0 })
    .int("idempotencyTtlMs", "IDEMPOTENCY_TTL_MS", 86_400_000, { min: 0 })
    .int("reservationExpiryIntervalMs", "RESERVATION_EXPIRY_INTERVAL_MS", 5000, { min: 0 })
    .int("ledgerVerificationIntervalMs", "LEDGER_VERIFICATION_INTERVAL_MS", 60000, { min: 0 })
    .string("logLevel", "LOG_LEVEL", "info")
    .string("otelExporterEndpoint", "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    .string("jwtSecret", "JWT_SECRET", "default-secret")
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
