export interface Config {
  grpcPort: number;
  metricsPort: number;
  redisUrl: string;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string;
  eventStreamKey: string;
}

export function loadConfig(): Config {
  return {
    grpcPort: parseInt(process.env.GRPC_PORT ?? "50055", 10),
    metricsPort: parseInt(process.env.METRICS_PORT ?? "9105", 10),
    redisUrl: process.env.REDIS_URL?.trim() || "redis://localhost:6379",
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || null,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() || null,
    vapidSubject: process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com",
    eventStreamKey: process.env.EVENT_STREAM_KEY?.trim() || "events:game",
  };
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}
