import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addService, bindAsync, forceShutdown, start, createHandlers } = vi.hoisted(() => ({
  addService: vi.fn(),
  bindAsync: vi.fn(),
  forceShutdown: vi.fn(),
  start: vi.fn(),
  createHandlers: vi.fn(() => ({
    publishEvent: vi.fn(),
    publishEvents: vi.fn(),
    queryEvents: vi.fn(),
    getEvent: vi.fn(),
    getHandRecord: vi.fn(),
    getHandHistory: vi.fn(),
    getHandsForUser: vi.fn(),
    getHandReplay: vi.fn(),
    subscribeToStream: vi.fn(),
    getCursor: vi.fn(),
    updateCursor: vi.fn(),
  })),
}));

vi.mock('@grpc/grpc-js', () => ({
  Server: vi.fn(() => ({
    addService,
    bindAsync,
    forceShutdown,
    start,
  })),
  ServerCredentials: {
    createInsecure: vi.fn(() => 'creds'),
  },
  loadPackageDefinition: vi.fn(() => ({
    event: { EventService: { service: { name: 'EventService' } } },
  })),
}));

vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn(() => ({})),
}));

vi.mock('../handlers', () => ({
  createHandlers,
}));

import { startGrpcServer, stopGrpcServer } from '../server';

describe('event gRPC server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds and registers handlers', async () => {
    bindAsync.mockImplementation(
      (_: string, __: unknown, callback: (err: Error | null, port: number) => void) => {
        callback(null, 50054);
      },
    );

    await startGrpcServer(50054);

    expect(createHandlers).toHaveBeenCalledTimes(1);
    expect(addService).toHaveBeenCalledWith(
      { name: 'EventService' },
      expect.objectContaining({
        PublishEvent: expect.any(Function),
        PublishEvents: expect.any(Function),
        QueryEvents: expect.any(Function),
        GetEvent: expect.any(Function),
      }),
    );
    expect(bindAsync).toHaveBeenCalledWith('0.0.0.0:50054', 'creds', expect.any(Function));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('rejects when bind fails', async () => {
    bindAsync.mockImplementation(
      (_: string, __: unknown, callback: (err: Error | null, port: number) => void) => {
        callback(new Error('bind fail'), 0);
      },
    );

    await expect(startGrpcServer(50054)).rejects.toThrow('bind fail');
  });

  it('can be stopped', async () => {
    bindAsync.mockImplementation(
      (_: string, __: unknown, callback: (err: Error | null, port: number) => void) => {
        callback(null, 50054);
      },
    );

    await startGrpcServer(50054);
    stopGrpcServer();

    expect(forceShutdown).toHaveBeenCalledTimes(1);
  });
});
