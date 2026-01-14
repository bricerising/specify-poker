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
    port: parseInt(process.env.PORT ?? "4000", 10),
    jwtSecret: process.env.JWT_SECRET ?? "default-secret",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    gameServiceUrl: process.env.GAME_SERVICE_URL ?? "localhost:50053",
    playerServiceUrl: process.env.PLAYER_SERVICE_URL ?? "localhost:50052",
    balanceServiceUrl: process.env.BALANCE_SERVICE_URL ?? "localhost:50051",
    balanceServiceHttpUrl: process.env.BALANCE_SERVICE_HTTP_URL ?? "localhost:3002",
    eventServiceUrl: process.env.EVENT_SERVICE_URL ?? "localhost:50054",
    notifyServiceUrl: process.env.NOTIFY_SERVICE_URL ?? "localhost:50055",
    metricsPort: parseInt(process.env.METRICS_PORT ?? "9100", 10),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  };
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}
