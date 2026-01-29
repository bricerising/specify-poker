import { describe, expect, it, vi } from 'vitest';

import { unaryCall, unaryCallResult } from '../src/grpc/call';

describe('unaryCall', () => {
  it('resolves successful responses', async () => {
    const method = vi.fn(
      (request: { value: number }, callback: (err: Error | null, response: number) => void) => {
        callback(null, request.value + 1);
      },
    );

    await expect(unaryCall(method, { value: 1 })).resolves.toBe(2);
    expect(method).toHaveBeenCalledTimes(1);
  });

  it('rejects errors', async () => {
    const error = new Error('boom');
    const method = vi.fn(
      (_request: unknown, callback: (err: Error | null, response: number) => void) => {
        callback(error, 0);
      },
    );

    await expect(unaryCall(method, { value: 1 })).rejects.toBe(error);
  });

  it('cancels and rejects on abort', async () => {
    const cancel = vi.fn();
    let capturedCallback: ((err: Error | null, response: string) => void) | null = null;

    const method = vi.fn(
      (_request: unknown, callback: (err: Error | null, response: string) => void) => {
        capturedCallback = callback;
        return { cancel };
      },
    );

    const controller = new AbortController();
    const promise = unaryCall(method, { value: 1 }, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledTimes(1);

    capturedCallback?.(null, 'ok');
  });

  it('cancels and rejects on timeout', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      let capturedCallback: ((err: Error | null, response: string) => void) | null = null;

      const method = vi.fn(
        (_request: unknown, callback: (err: Error | null, response: string) => void) => {
          capturedCallback = callback;
          return { cancel };
        },
      );

      const promise = unaryCall(method, { value: 1 }, { timeoutMs: 10 });
      const expectation = expect(promise).rejects.toMatchObject({
        name: 'AbortError',
        message: expect.stringMatching(/Timed out/),
      });
      await vi.advanceTimersByTimeAsync(10);
      await expectation;
      expect(cancel).toHaveBeenCalledTimes(1);

      capturedCallback?.(null, 'ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects immediately when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const method = vi.fn(
      (_request: unknown, _callback: (err: Error | null, response: number) => void) => undefined,
    );
    await expect(
      unaryCall(method, { value: 1 }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(method).not.toHaveBeenCalled();
  });
});

describe('unaryCallResult', () => {
  it('returns { ok: false } when the call rejects', async () => {
    const error = new Error('boom');
    const method = vi.fn(
      (_request: unknown, callback: (err: Error | null, response: number) => void) => {
        callback(error, 0);
      },
    );

    const result = await unaryCallResult(method, { value: 1 });
    expect(result).toEqual({ ok: false, error });
  });
});
