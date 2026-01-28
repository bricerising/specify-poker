import { describe, it, expect, vi } from 'vitest';
import { createHealthHandlers } from '../../src/api/grpc/health';

describe('health handlers', () => {
  it('responds with SERVING for unary checks', () => {
    const handlers = createHealthHandlers();
    const callback = vi.fn();

    handlers.check({}, callback);

    expect(callback).toHaveBeenCalledWith(null, { status: 'SERVING' });
  });

  it('streams SERVING status for watch', () => {
    const handlers = createHealthHandlers();
    const write = vi.fn();
    const end = vi.fn();

    handlers.watch({ write, end });

    expect(write).toHaveBeenCalledWith({ status: 'SERVING' });
    expect(end).toHaveBeenCalled();
  });
});
