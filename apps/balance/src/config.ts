import dotenv from "dotenv";

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
  return {
    httpPort: parseInt(process.env.HTTP_PORT ?? "3002", 10),
    grpcPort: parseInt(process.env.GRPC_PORT ?? "50051", 10),
    metricsPort: parseInt(process.env.METRICS_PORT ?? "9102", 10),
    redisUrl: process.env.REDIS_URL?.trim() || null,
    reservationTimeoutMs: parseInt(process.env.RESERVATION_TIMEOUT_MS ?? "30000", 10),
    idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS ?? "86400000", 10), // 24 hours
    reservationExpiryIntervalMs: parseInt(process.env.RESERVATION_EXPIRY_INTERVAL_MS ?? "5000", 10),
    ledgerVerificationIntervalMs: parseInt(process.env.LEDGER_VERIFICATION_INTERVAL_MS ?? "60000", 10),
    logLevel: process.env.LOG_LEVEL ?? "info",
    otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4317",
    jwtSecret: process.env.JWT_SECRET ?? "default-secret",
  };
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}
