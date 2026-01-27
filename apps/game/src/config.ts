import dotenv from "dotenv";

import { parseEnvInt, parseEnvString } from "./utils/coerce";

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

export const config: Config = {
  port: parseEnvInt(process.env, ["GRPC_PORT", "PORT"], 50053),
  metricsPort: parseEnvInt(process.env, ["METRICS_PORT"], 9105),
  redisUrl: parseEnvString(process.env, ["REDIS_URL"], "redis://localhost:6379"),
  balanceServiceAddr: parseEnvString(
    process.env,
    ["BALANCE_SERVICE_URL", "BALANCE_SERVICE_ADDR"],
    "localhost:50051",
  ),
  eventServiceAddr: parseEnvString(
    process.env,
    ["EVENT_SERVICE_URL", "EVENT_SERVICE_ADDR"],
    "localhost:50054",
  ),
  turnTimeout: parseEnvInt(process.env, ["TURN_TIMEOUT"], 20000),
  logLevel: parseEnvString(process.env, ["LOG_LEVEL"], "info"),
  otelExporterEndpoint: parseEnvString(
    process.env,
    ["OTEL_EXPORTER_OTLP_ENDPOINT"],
    "http://localhost:4317",
  ),
};

export function getConfig() {
  return config;
}
