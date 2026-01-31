import { describe, it, expect, vi } from 'vitest';
import { createGrpcServer } from '../../src/api/grpc/server';
import * as grpc from '@grpc/grpc-js';
import type { NotifyService } from '../../src/services/notifyService';

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
    const notifyServiceMock = {} as unknown as NotifyService;

    const server = createGrpcServer({ port: 50055, notifyService: notifyServiceMock });
    await server.start();
    expect(grpc.Server).toHaveBeenCalled();

    server.stop();
  });
});
