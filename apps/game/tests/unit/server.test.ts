import { afterEach, describe, expect, it, vi } from 'vitest';

const serverState = vi.hoisted(() => ({
  connectRedis: vi.fn(async () => undefined),
  closeRedisClient: vi.fn(async () => undefined),
  startGrpcServer: vi.fn(async () => undefined),
  stopGrpcServer: vi.fn(),
  closeGrpcClients: vi.fn(),
  startMetricsServer: vi.fn(() => ({
    close: vi.fn((callback?: (err?: Error) => void) => {
      callback?.();
    }),
  })),
  stopObservability: vi.fn(async () => undefined),
  startObservability: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/observability', () => ({
  startObservability: serverState.startObservability,
  stopObservability: serverState.stopObservability,
}));

vi.mock('../../src/api/grpc/server', () => ({
  startGrpcServer: serverState.startGrpcServer,
  stopGrpcServer: serverState.stopGrpcServer,
}));

vi.mock('../../src/api/grpc/clients', () => ({
  getBalanceClient: () => ({}),
  getEventClient: () => ({}),
  closeGrpcClients: serverState.closeGrpcClients,
}));

vi.mock('../../src/storage/redisClient', () => ({
  connectRedis: serverState.connectRedis,
  closeRedisClient: serverState.closeRedisClient,
}));

vi.mock('../../src/observability/metrics', () => ({
  startMetricsServer: serverState.startMetricsServer,
  recordGrpcRequest: vi.fn(),
  recordHandStarted: vi.fn(),
  recordHandCompleted: vi.fn(),
  recordAction: vi.fn(),
  recordSeatJoin: vi.fn(),
  recordTurnTimeout: vi.fn(),
  recordTurnTime: vi.fn(),
  setActiveTables: vi.fn(),
  setSeatedPlayers: vi.fn(),
  setSpectatorCount: vi.fn(),
  renderMetrics: vi.fn(async () => ''),
}));

vi.mock('../../src/observability/logger', () => ({
  default: serverState.logger,
}));

vi.mock('../../src/config', () => ({
  getConfig: () => ({ port: 50053, metricsPort: 9105 }),
}));

describe('server lifecycle', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('starts services and shuts down cleanly', async () => {
    const server = await import('../../src/server');

    process.env.NODE_ENV = 'production';
    await server.main();
    expect(serverState.connectRedis).toHaveBeenCalledTimes(1);
    expect(serverState.startGrpcServer).toHaveBeenCalledWith(50053);
    expect(serverState.startMetricsServer).toHaveBeenCalledWith(9105);

    await server.shutdown();
    expect(serverState.stopGrpcServer).toHaveBeenCalledTimes(1);
    expect(serverState.closeGrpcClients).toHaveBeenCalledTimes(1);
    expect(serverState.closeRedisClient).toHaveBeenCalledTimes(1);
    expect(serverState.stopObservability).toHaveBeenCalledTimes(1);
  });
});
