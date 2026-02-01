import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHandlers } from '../../src/api/grpc/handlers';
import type { NotifyService } from '../../src/services/notifyService';

vi.mock('../../src/storage/redisClient', () => {
  const store = new Map<string, string>();
  return {
    getRedisClient: vi.fn(async () => ({
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, options?: { NX?: boolean; PX?: number }) => {
        if (options?.NX && store.has(key)) {
          return null;
        }
        store.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => {
        const existed = store.delete(key);
        return existed ? 1 : 0;
      }),
    })),
  };
});

describe('gRPC Handlers', () => {
  let handlers: unknown;
  let notifyServiceMock: NotifyService;

  beforeEach(() => {
    notifyServiceMock = {
      registerSubscription: vi.fn(),
      unregisterSubscription: vi.fn(),
      listSubscriptions: vi.fn(),
      sendNotification: vi.fn(),
    };
    handlers = createHandlers(notifyServiceMock);
  });

  it('registerSubscription should save subscription', async () => {
    const call = {
      request: {
        userId: 'u1',
        subscription: {
          endpoint: 'e1',
          keys: { p256dh: 'd1', auth: 'a1' },
        },
        idempotencyKey: 'idempotency-1',
      },
    };
    const callback = vi.fn();

    await handlers.registerSubscription(call, callback);

    expect(notifyServiceMock.registerSubscription).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(null, { ok: true });
  });

  it('registerSubscription should return error if fields are missing', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();

    await handlers.registerSubscription(call, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ ok: false, error: 'MISSING_FIELDS' }),
    );
  });

  it('unregisterSubscription should delete subscription', async () => {
    const call = {
      request: {
        userId: 'u1',
        endpoint: 'e1',
        idempotencyKey: 'idempotency-2',
      },
    };
    const callback = vi.fn();

    await handlers.unregisterSubscription(call, callback);

    expect(notifyServiceMock.unregisterSubscription).toHaveBeenCalledWith('u1', 'e1');
    expect(callback).toHaveBeenCalledWith(null, { ok: true });
  });

  it('unregisterSubscription should return error if fields are missing', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();

    await handlers.unregisterSubscription(call, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ ok: false, error: 'MISSING_FIELDS' }),
    );
  });

  it('listSubscriptions should return subscriptions', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();
    (notifyServiceMock.listSubscriptions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { endpoint: 'e1', keys: { p256dh: 'd1', auth: 'a1' } },
    ]);

    await handlers.listSubscriptions(call, callback);

    expect(notifyServiceMock.listSubscriptions).toHaveBeenCalledWith('u1');
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        subscriptions: expect.arrayContaining([expect.objectContaining({ endpoint: 'e1' })]),
      }),
    );
  });

  it('listSubscriptions should return empty array if userId is missing', async () => {
    const call = { request: {} };
    const callback = vi.fn();

    await handlers.listSubscriptions(call, callback);

    expect(callback).toHaveBeenCalledWith(null, { subscriptions: [] });
  });

  it('sendNotification should call pushService', async () => {
    const call = {
      request: {
        userId: 'u1',
        title: 'T',
        body: 'B',
        idempotencyKey: 'idempotency-3',
      },
    };
    const callback = vi.fn();
    (notifyServiceMock.sendNotification as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: 1,
      failure: 0,
    });

    await handlers.sendNotification(call, callback);

    expect(notifyServiceMock.sendNotification).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'T', body: 'B' }),
    );
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ ok: true, successCount: 1 }),
    );
  });

  it('sendNotification should return error if fields are missing', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();

    await handlers.sendNotification(call, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ ok: false, error: 'MISSING_FIELDS' }),
    );
  });

  it('should handle errors in handlers', async () => {
    const call = {
      request: {
        userId: 'u1',
        subscription: {
          endpoint: 'e1',
          keys: { p256dh: 'd1', auth: 'a1' },
        },
        idempotencyKey: 'idempotency-4',
      },
    };
    const callback = vi.fn();
    (notifyServiceMock.registerSubscription as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Internal Error'),
    );

    await handlers.registerSubscription(call, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ ok: false, error: 'Internal Error' }),
    );
  });
});
