import dotenv from "dotenv";

import { createConfigBuilder } from "@specify-poker/shared";

dotenv.config();

export type Config = {
  port: number;
  metricsPort: number;
  redisUrl: string;
  balanceServiceAddr: string;
  eventServiceAddr: string;
  turnTimeout: number;
  logLevel: string;
  otelExporterEndpoint: string;
};

export const config: Config = createConfigBuilder(process.env)
  .int("port", ["GRPC_PORT", "PORT"], 50053, { min: 1, max: 65535 })
  .int("metricsPort", "METRICS_PORT", 9105, { min: 1, max: 65535 })
  .string("redisUrl", "REDIS_URL", "redis://localhost:6379")
  .string(
    "balanceServiceAddr",
    ["BALANCE_SERVICE_URL", "BALANCE_SERVICE_ADDR"],
    "localhost:50051",
  )
  .string(
    "eventServiceAddr",
    ["EVENT_SERVICE_URL", "EVENT_SERVICE_ADDR"],
    "localhost:50054",
  )
  .int("turnTimeout", "TURN_TIMEOUT", 20000, { min: 0 })
  .string("logLevel", "LOG_LEVEL", "info")
  .string("otelExporterEndpoint", "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
  .build();

export function getConfig(): Config {
  return config;
}
