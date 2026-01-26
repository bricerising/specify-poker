import dotenv from "dotenv";

dotenv.config();

export type Config = {
  grpcPort: number;
  metricsPort: number;
  databaseUrl: string;
  redisUrl: string;
  logLevel: string;
  otelExporterEndpoint: string;
};

function parsePositiveInt(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer (got ${raw})`);
  }
  return parsed;
}

function parseNonEmptyString(envName: string, fallback: string): string {
  const raw = process.env[envName];
  if (!raw) {
    return fallback;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error(`${envName} must be a non-empty string`);
  }
  return trimmed;
}

export function loadConfig(): Config {
  return {
    grpcPort: parsePositiveInt("GRPC_PORT", 50054),
    metricsPort: parsePositiveInt("METRICS_PORT", 9104),
    databaseUrl: parseNonEmptyString("DATABASE_URL", "postgresql://event:event@event-db:5432/event"),
    redisUrl: parseNonEmptyString("REDIS_URL", "redis://redis:6379"),
    logLevel: parseNonEmptyString("LOG_LEVEL", "info"),
    otelExporterEndpoint: parseNonEmptyString("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
  };
}

export const config = loadConfig();
