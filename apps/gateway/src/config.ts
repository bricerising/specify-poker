import { readIntEnv, readStringEnv } from "./utils/env";

export interface Config {
  port: number;
  jwtSecret: string;
  redisUrl: string;
  gameServiceUrl: string;
  playerServiceUrl: string;
  balanceServiceUrl: string;
  balanceServiceHttpUrl: string;
  eventServiceUrl: string;
  notifyServiceUrl: string;
  metricsPort: number;
  corsOrigin: string;
}

export function loadConfig(): Config {
  return {
    port: readIntEnv("PORT", 4000, { min: 1, max: 65535 }),
    jwtSecret: readStringEnv("JWT_SECRET", "default-secret"),
    redisUrl: readStringEnv("REDIS_URL", "redis://localhost:6379"),
    gameServiceUrl: readStringEnv("GAME_SERVICE_URL", "localhost:50053"),
    playerServiceUrl: readStringEnv("PLAYER_SERVICE_URL", "localhost:50052"),
    balanceServiceUrl: readStringEnv("BALANCE_SERVICE_URL", "localhost:50051"),
    balanceServiceHttpUrl: readStringEnv("BALANCE_SERVICE_HTTP_URL", "localhost:3002"),
    eventServiceUrl: readStringEnv("EVENT_SERVICE_URL", "localhost:50054"),
    notifyServiceUrl: readStringEnv("NOTIFY_SERVICE_URL", "localhost:50055"),
    metricsPort: readIntEnv("METRICS_PORT", 9100, { min: 1, max: 65535 }),
    corsOrigin: readStringEnv("CORS_ORIGIN", "http://localhost:3000"),
  };
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}
