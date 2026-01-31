import { describe, it, expect, beforeEach, vi } from 'vitest';

const addService = vi.fn();
const bindAsync = vi.fn();
const forceShutdown = vi.fn();

vi.mock('@grpc/grpc-js', () => ({
  Server: vi.fn(() => ({
    addService,
    bindAsync,
    forceShutdown,
  })),
  ServerCredentials: {
    createInsecure: vi.fn(() => ({})),
  },
  loadPackageDefinition: vi.fn(() => ({
    player: {
      PlayerService: { service: {} },
    },
    grpc: {
      health: {
        v1: { Health: { service: {} } },
      },
    },
  })),
}));

vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn(() => ({})),
}));

vi.mock('@grpc/grpc-js/package.json', () => ({}));

vi.mock('@grpc/grpc-js/build/src/constants', () => ({}));

vi.mock('../../src/api/grpc/handlers', () => ({
  handlers: {
    GetProfile: vi.fn(),
    GetProfiles: vi.fn(),
    UpdateProfile: vi.fn(),
    DeleteProfile: vi.fn(),
    GetStatistics: vi.fn(),
    IncrementStatistic: vi.fn(),
    GetFriends: vi.fn(),
    AddFriend: vi.fn(),
    RemoveFriend: vi.fn(),
    GetNicknames: vi.fn(),
  },
}));

vi.mock('../../src/api/grpc/health', () => ({
  createHealthHandlers: vi.fn(() => ({
    check: vi.fn(),
    watch: vi.fn(),
  })),
}));

vi.mock('../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
  },
}));

describe('gRPC server lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindAsync.mockImplementation(
      (_addr: string, _creds: unknown, cb: (err: Error | null, port: number) => void) => {
        cb(null, 50052);
      },
    );
  });

  it('starts and registers services', async () => {
    const { createGrpcServer } = await import('../../src/api/grpc/server');

    const server = createGrpcServer({ port: 50052 });
    await server.start();

    expect(addService).toHaveBeenCalledTimes(2);
    expect(bindAsync).toHaveBeenCalledWith(
      '0.0.0.0:50052',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('stops the server gracefully', async () => {
    const { createGrpcServer } = await import('../../src/api/grpc/server');

    const server = createGrpcServer({ port: 50052 });
    await server.start();
    server.stop();

    expect(forceShutdown).toHaveBeenCalled();
  });
});
