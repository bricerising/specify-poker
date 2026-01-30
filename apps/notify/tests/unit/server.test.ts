import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/observability', () => ({
  startObservability: vi.fn(),
  stopObservability: vi.fn(),
}));

vi.mock('../../src/app', () => ({
  createNotifyApp: vi.fn(),
}));

import { main } from '../../src/server';
import { createNotifyApp } from '../../src/app';
import { resetConfigForTests } from '../../src/config';
import { startObservability, stopObservability } from '../../src/observability';

describe('Server main', () => {
  it('should initialize and start services', async () => {
    const appMock = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      services: {},
    };
    (createNotifyApp as unknown).mockReturnValue(appMock);

    await main();
    expect(appMock.start).toHaveBeenCalled();
  });

  it('should throw error if start fails', async () => {
    const appMock = {
      start: vi.fn().mockRejectedValue(new Error('Start failed')),
      stop: vi.fn().mockResolvedValue(undefined),
      services: {},
    };
    (createNotifyApp as unknown).mockReturnValue(appMock);

    await expect(main()).rejects.toThrow('Start failed');
    expect(appMock.stop).toHaveBeenCalled();
  });

  it('should stop observability if config is invalid', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousGrpcPort = process.env.GRPC_PORT;

    try {
      process.env.NODE_ENV = 'production';
      process.env.GRPC_PORT = '0';
      resetConfigForTests();

      await expect(main()).rejects.toBeInstanceOf(Error);
      expect(startObservability).toHaveBeenCalled();
      expect(stopObservability).toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousGrpcPort === undefined) {
        delete process.env.GRPC_PORT;
      } else {
        process.env.GRPC_PORT = previousGrpcPort;
      }

      resetConfigForTests();
    }
  });
});
