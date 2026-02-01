import { createConfigAccessors, createConfigBuilder } from '@specify-poker/shared';

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
  grpcClientTimeoutMs: number;
  metricsPort: number;
  corsOrigin: string;
  trustProxyHops: number;
}

export function loadConfig(): Config {
  const config: Config = createConfigBuilder(process.env)
    .int('port', 'PORT', 4000, { min: 1, max: 65535 })
    // NOTE: HS256 secrets must be explicitly configured (prefer Keycloak RS256).
    .string('jwtSecret', ['JWT_HS256_SECRET', 'JWT_SECRET'], '')
    .string('redisUrl', 'REDIS_URL', 'redis://localhost:6379')
    .string('gameServiceUrl', 'GAME_SERVICE_URL', 'localhost:50053')
    .string('playerServiceUrl', 'PLAYER_SERVICE_URL', 'localhost:50052')
    .string('balanceServiceUrl', 'BALANCE_SERVICE_URL', 'localhost:50051')
    .string('balanceServiceHttpUrl', 'BALANCE_SERVICE_HTTP_URL', 'localhost:3002')
    .string('eventServiceUrl', 'EVENT_SERVICE_URL', 'localhost:50054')
    .string('notifyServiceUrl', 'NOTIFY_SERVICE_URL', 'localhost:50055')
    .int('grpcClientTimeoutMs', 'GRPC_CLIENT_TIMEOUT_MS', 2_000, { min: 0 })
    .int('metricsPort', 'METRICS_PORT', 9100, { min: 1, max: 65535 })
    .string('corsOrigin', 'CORS_ORIGIN', 'http://localhost:3000')
    .int('trustProxyHops', 'TRUST_PROXY_HOPS', 0, { min: 0, max: 100 })
    .build();

  return config;
}

const configAccessors = createConfigAccessors(loadConfig);

export function getConfig(): Config {
  return configAccessors.getConfig();
}

export function resetConfigForTests(): void {
  configAccessors.resetConfigForTests();
}
