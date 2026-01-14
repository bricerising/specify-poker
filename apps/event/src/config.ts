import dotenv from "dotenv";

dotenv.config();

export const config = {
  grpcPort: parseInt(process.env.GRPC_PORT || "50054", 10),
  metricsPort: parseInt(process.env.METRICS_PORT || "9104", 10),
  databaseUrl: process.env.DATABASE_URL || "postgresql://event:event@event-db:5432/event",
  redisUrl: process.env.REDIS_URL || "redis://redis:6379",
  logLevel: process.env.LOG_LEVEL || "info",
  otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
};
