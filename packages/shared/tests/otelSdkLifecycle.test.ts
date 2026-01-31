import { describe, expect, it, vi } from 'vitest';

import { createOtelSdkLifecycle } from '../src/observability/otelSdkLifecycle';

describe('createOtelSdkLifecycle', () => {
  it('starts and stops the SDK and calls hooks', async () => {
    const start = vi.fn();
    const shutdown = vi.fn();

    const onStarted = vi.fn();
    const onStopped = vi.fn();

    const lifecycle = createOtelSdkLifecycle({
      createSdk: () => ({ start, shutdown }),
      onStarted,
      onStopped,
    });

    await lifecycle.start();
    await lifecycle.stop();

    expect(start).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStopped).toHaveBeenCalledTimes(1);
  });

  it('logs lifecycle events when logger is provided and hooks are omitted', async () => {
    const start = vi.fn();
    const shutdown = vi.fn();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const lifecycle = createOtelSdkLifecycle({
      createSdk: () => ({ start, shutdown }),
      logger,
    });

    await lifecycle.start();
    await lifecycle.stop();

    expect(start).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenNthCalledWith(1, 'OpenTelemetry SDK started');
    expect(logger.info).toHaveBeenNthCalledWith(2, 'OpenTelemetry SDK shut down');
  });

  it('does not create SDK when stopped before start', async () => {
    const createSdk = vi.fn();
    const lifecycle = createOtelSdkLifecycle({ createSdk });

    await lifecycle.stop();

    expect(createSdk).toHaveBeenCalledTimes(0);
  });

  it('shuts down and resets when start fails', async () => {
    const startError = new Error('boom');

    const sdkA = {
      start: vi.fn(() => {
        throw startError;
      }),
      shutdown: vi.fn(),
    };
    const sdkB = {
      start: vi.fn(),
      shutdown: vi.fn(),
    };

    const createSdk = vi
      .fn()
      .mockImplementationOnce(() => sdkA)
      .mockImplementationOnce(() => sdkB);

    const lifecycle = createOtelSdkLifecycle({ createSdk });

    await expect(lifecycle.start()).rejects.toThrow('boom');
    expect(sdkA.shutdown).toHaveBeenCalledTimes(1);

    await lifecycle.start();
    await lifecycle.stop();

    expect(createSdk).toHaveBeenCalledTimes(2);
    expect(sdkB.start).toHaveBeenCalledTimes(1);
    expect(sdkB.shutdown).toHaveBeenCalledTimes(1);
  });
});
