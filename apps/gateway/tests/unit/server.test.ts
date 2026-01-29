import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const app = { use: vi.fn() };
const server = {
  listen: vi.fn((_port: number, cb: () => void) => cb()),
  close: vi.fn((cb: () => void) => cb()),
};
const wss = {
  clients: new Set(),
  close: vi.fn((cb: () => void) => cb()),
};

vi.mock('express', () => ({
  default: vi.fn(() => app),
}));

vi.mock('cors', () => ({
  default: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('http', () => ({
  createServer: vi.fn(() => server),
}));

vi.mock('../../src/config', () => ({
  getConfig: () => ({ port: 4000, corsOrigin: '*' }),
}));

vi.mock('../../src/http/router', () => ({
  createRouter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/ws/server', () => ({
  initWsServer: vi.fn().mockResolvedValue(wss),
}));

vi.mock('../../src/observability/otel', () => ({
  initOTEL: vi.fn(),
  shutdownOTEL: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/ws/pubsub', () => ({
  closeWsPubSub: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/grpc/clients', () => ({
  closeGrpcClients: vi.fn(),
}));

vi.mock('../../src/storage/instanceRegistry', () => ({
  registerInstance: vi.fn().mockResolvedValue(undefined),
  unregisterInstance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/storage/redisClient', () => ({
  closeRedisClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('prom-client', () => ({
  collectDefaultMetrics: vi.fn(),
}));

vi.mock('../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Gateway server startup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {});

  it('boots services and listens for shutdown', async () => {
    const logger = (await import('../../src/observability/logger')).default;
    const { closeGrpcClients } = await import('../../src/grpc/clients');
    const { startServer, shutdown } = await import('../../src/server');

    await startServer();

    expect(server.listen).toHaveBeenCalledWith(4000, expect.any(Function));
    expect(logger.info).toHaveBeenCalledWith({ port: 4000 }, 'Gateway service started');

    await shutdown();
    expect(server.close).toHaveBeenCalled();
    expect(closeGrpcClients).toHaveBeenCalledTimes(1);
  });
});
