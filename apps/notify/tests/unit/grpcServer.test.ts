import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startGrpcServer, stopGrpcServer } from '../../src/api/grpc/server';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

vi.mock('@grpc/grpc-js', () => {
  const Server = vi.fn().mockImplementation(() => ({
    addService: vi.fn(),
    bindAsync: vi.fn((addr, creds, cb) => cb(null, 50055)),
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
    }),
  };
});

vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn().mockReturnValue({}),
}));

describe('gRPC Server', () => {
  it('should start and stop gRPC server', async () => {
    const storeMock = {} as any;
    const pushMock = {} as any;
    
    await startGrpcServer(50055, storeMock, pushMock);
    expect(grpc.Server).toHaveBeenCalled();
    
    stopGrpcServer();
  });
});
