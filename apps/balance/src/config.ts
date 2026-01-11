export interface Config {
  httpPort: number;
  grpcPort: number;
  redisUrl: string | null;
  reservationTimeoutMs: number;
  idempotencyTtlMs: number;
  reservationExpiryIntervalMs: number;
  ledgerVerificationIntervalMs: number;
}

export function loadConfig(): Config {
  return {
    httpPort: parseInt(process.env.HTTP_PORT ?? "3002", 10),
    grpcPort: parseInt(process.env.GRPC_PORT ?? "50051", 10),
    redisUrl: process.env.REDIS_URL?.trim() || null,
    reservationTimeoutMs: parseInt(process.env.RESERVATION_TIMEOUT_MS ?? "30000", 10),
    idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS ?? "86400000", 10), // 24 hours
    reservationExpiryIntervalMs: parseInt(process.env.RESERVATION_EXPIRY_INTERVAL_MS ?? "5000", 10),
    ledgerVerificationIntervalMs: parseInt(process.env.LEDGER_VERIFICATION_INTERVAL_MS ?? "60000", 10),
  };
}

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}
