import { describe, it, expect, vi } from 'vitest';
import { startGrpcServer, stopGrpcServer } from '../../src/api/grpc/server';
import * as grpc from '@grpc/grpc-js';

vi.mock('@grpc/grpc-js', () => {
  const Server = vi.fn().mockImplementation(() => ({
    addService: vi.fn(),
    bindAsync: vi.fn((addr, creds, cb) => cb(null, 50055)),
    start: vi.fn(),
    forceShutdown: vi.fn(),
  }));
  return {
    Server,
    ServerCredentials: {
      createInsecure: vi.fn(),
    },
    loadPackageDefinition: vi.fn().mockReturnValue({
      notify: {
        NotifyService: {
          service: {},
        },
      },
      grpc: {
        health: {
          v1: {
            Health: {
              service: {},
            },
          },
        },
      },
    }),
  };
});

vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn().mockReturnValue({}),
}));

describe('gRPC Server', () => {
  it('should start and stop gRPC server', async () => {
    const subscriptionServiceMock = {} as unknown;
    const pushMock = {} as unknown;

    await startGrpcServer(50055, subscriptionServiceMock, pushMock);
    expect(grpc.Server).toHaveBeenCalled();

    stopGrpcServer();
  });
});
