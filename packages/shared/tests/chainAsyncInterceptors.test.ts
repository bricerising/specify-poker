import { describe, expect, it, vi } from 'vitest';

import { chainAsyncInterceptors } from '../src/pipeline';

describe('chainAsyncInterceptors', () => {
  it('runs interceptors in array order', async () => {
    const calls: string[] = [];

    const handler = vi.fn(async (ctx: { value: number }) => {
      calls.push('handler');
      return ctx.value + 1;
    });

    const a = vi.fn(async (ctx: { value: number }, next: typeof handler) => {
      calls.push('a.before');
      const result = await next(ctx);
      calls.push('a.after');
      return result;
    });

    const b = vi.fn(async (ctx: { value: number }, next: typeof handler) => {
      calls.push('b.before');
      const result = await next(ctx);
      calls.push('b.after');
      return result;
    });

    const chained = chainAsyncInterceptors(handler, [a, b]);
    await expect(chained({ value: 1 })).resolves.toBe(2);
    expect(calls).toEqual(['a.before', 'b.before', 'handler', 'b.after', 'a.after']);
  });

  it('supports short-circuiting (not calling next)', async () => {
    const handler = vi.fn(async () => 'handler');
    const shortCircuit = vi.fn(async () => 'short');

    const chained = chainAsyncInterceptors(handler, [
      async (ctx: unknown, _next: typeof handler) => shortCircuit(ctx),
    ]);

    await expect(chained({})).resolves.toBe('short');
    expect(handler).not.toHaveBeenCalled();
  });

  it('propagates errors unless an interceptor handles them', async () => {
    const error = new Error('boom');
    const handler = vi.fn(async () => {
      throw error;
    });

    const calls: string[] = [];
    const interceptor = vi.fn(async (ctx: unknown, next: typeof handler) => {
      try {
        return await next(ctx);
      } catch (err: unknown) {
        calls.push('caught');
        throw err;
      }
    });

    const chained = chainAsyncInterceptors(handler, [interceptor]);
    await expect(chained({})).rejects.toThrow('boom');
    expect(calls).toEqual(['caught']);
  });
});
