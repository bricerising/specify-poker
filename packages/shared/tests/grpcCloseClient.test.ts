import { describe, expect, it, vi } from 'vitest';

import { closeGrpcClient } from '../src/grpc/closeClient';

describe('closeGrpcClient', () => {
  it('no-ops for non-objects', () => {
    expect(() => closeGrpcClient(null)).not.toThrow();
    expect(() => closeGrpcClient(undefined)).not.toThrow();
    expect(() => closeGrpcClient('not-a-client')).not.toThrow();
  });

  it('calls client.close() when available', () => {
    const close = vi.fn();
    closeGrpcClient({ close });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('falls back to getChannel().close() when close() is absent', () => {
    const channelClose = vi.fn();
    const getChannel = vi.fn(() => ({ close: channelClose }));

    closeGrpcClient({ getChannel });

    expect(getChannel).toHaveBeenCalledTimes(1);
    expect(channelClose).toHaveBeenCalledTimes(1);
  });

  it('prefers client.close() over getChannel().close()', () => {
    const close = vi.fn();
    const channelClose = vi.fn();
    const getChannel = vi.fn(() => ({ close: channelClose }));

    closeGrpcClient({ close, getChannel });

    expect(close).toHaveBeenCalledTimes(1);
    expect(getChannel).toHaveBeenCalledTimes(0);
    expect(channelClose).toHaveBeenCalledTimes(0);
  });
});

