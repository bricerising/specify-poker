export interface Config {
  grpcPort: number;
  metricsPort: number;
  redisUrl: string;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string;
  eventStreamKey: string;
}

function parsePort(envValue: string | undefined, defaultPort: number, envName: string): number {
  const value = envValue?.trim();
  if (!value) {
    return defaultPort;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${envName} must be an integer between 1 and 65535 (got "${value}")`);
  }

  return parsed;
}

function readNonEmptyString(envValue: string | undefined, fallback: string): string {
  return envValue?.trim() || fallback;
}

function readOptionalString(envValue: string | undefined): string | null {
  const value = envValue?.trim();
  return value ? value : null;
}

export function loadConfig(): Config {
  return {
    grpcPort: parsePort(process.env.GRPC_PORT, 50055, "GRPC_PORT"),
    metricsPort: parsePort(process.env.METRICS_PORT, 9105, "METRICS_PORT"),
    redisUrl: readNonEmptyString(process.env.REDIS_URL, "redis://localhost:6379"),
    vapidPublicKey: readOptionalString(process.env.VAPID_PUBLIC_KEY),
    vapidPrivateKey: readOptionalString(process.env.VAPID_PRIVATE_KEY),
    vapidSubject: readNonEmptyString(process.env.VAPID_SUBJECT, "mailto:admin@example.com"),
    eventStreamKey: readNonEmptyString(process.env.EVENT_STREAM_KEY, "events:game"),
  };
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

export function resetConfigForTests(): void {
  config = null;
}
