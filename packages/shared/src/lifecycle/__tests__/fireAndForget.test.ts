import { describe, expect, it, vi } from 'vitest';

import { fireAndForget } from '../fireAndForget';

describe('fireAndForget', () => {
  it('runs work and does not call onError on success', async () => {
    const onError = vi.fn();

    fireAndForget(async () => undefined, onError);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when work throws synchronously', async () => {
    const onError = vi.fn();

    fireAndForget(
      (): Promise<void> => {
        throw new Error('boom');
      },
      onError,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('calls onError when work rejects', async () => {
    const onError = vi.fn();

    fireAndForget(async () => Promise.reject(new Error('boom')), onError);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});

