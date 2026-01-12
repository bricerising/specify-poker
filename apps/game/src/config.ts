import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.GRPC_PORT || process.env.PORT || "50053", 10),
  metricsPort: parseInt(process.env.METRICS_PORT || "9105", 10),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  balanceServiceAddr: process.env.BALANCE_SERVICE_URL || process.env.BALANCE_SERVICE_ADDR || "localhost:50051",
  eventServiceAddr: process.env.EVENT_SERVICE_URL || process.env.EVENT_SERVICE_ADDR || "localhost:50054",
  turnTimeout: parseInt(process.env.TURN_TIMEOUT || "20000", 10),
  logLevel: process.env.LOG_LEVEL || "info",
  otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
};

export function getConfig() {
  return config;
}
