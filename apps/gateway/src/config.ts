import { createConfigBuilder, createLazyValue } from '@specify-poker/shared';

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
  const config: Config = createConfigBuilder(process.env)
    .int('port', 'PORT', 4000, { min: 1, max: 65535 })
    .string('jwtSecret', 'JWT_SECRET', 'default-secret')
    .string('redisUrl', 'REDIS_URL', 'redis://localhost:6379')
    .string('gameServiceUrl', 'GAME_SERVICE_URL', 'localhost:50053')
    .string('playerServiceUrl', 'PLAYER_SERVICE_URL', 'localhost:50052')
    .string('balanceServiceUrl', 'BALANCE_SERVICE_URL', 'localhost:50051')
    .string('balanceServiceHttpUrl', 'BALANCE_SERVICE_HTTP_URL', 'localhost:3002')
    .string('eventServiceUrl', 'EVENT_SERVICE_URL', 'localhost:50054')
    .string('notifyServiceUrl', 'NOTIFY_SERVICE_URL', 'localhost:50055')
    .int('metricsPort', 'METRICS_PORT', 9100, { min: 1, max: 65535 })
    .string('corsOrigin', 'CORS_ORIGIN', 'http://localhost:3000')
    .build();

  return config;
}

const cachedConfig = createLazyValue(loadConfig);

export function getConfig(): Config {
  return cachedConfig.get();
}

export function resetConfigForTests(): void {
  cachedConfig.reset();
}
