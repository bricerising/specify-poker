import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHandlers } from '../../src/api/grpc/handlers';

describe('gRPC Handlers', () => {
  let handlers: any;
  let storeMock: any;
  let pushServiceMock: any;

  beforeEach(() => {
    storeMock = {
      saveSubscription: vi.fn(),
      deleteSubscription: vi.fn(),
      getSubscriptions: vi.fn(),
    };
    pushServiceMock = {
      sendToUser: vi.fn(),
    };
    handlers = createHandlers(storeMock, pushServiceMock);
  });

  it('registerSubscription should save subscription', async () => {
    const call = {
      request: {
        userId: 'u1',
        subscription: {
          endpoint: 'e1',
          keys: { p256dh: 'd1', auth: 'a1' },
        },
      },
    };
    const callback = vi.fn();

    await handlers.registerSubscription(call, callback);

    expect(storeMock.saveSubscription).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(null, { ok: true });
  });

  it('registerSubscription should return error if fields are missing', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();

    await handlers.registerSubscription(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ ok: false, error: 'MISSING_FIELDS' }));
  });

  it('unregisterSubscription should delete subscription', async () => {
    const call = {
      request: {
        userId: 'u1',
        endpoint: 'e1',
      },
    };
    const callback = vi.fn();

    await handlers.unregisterSubscription(call, callback);

    expect(storeMock.deleteSubscription).toHaveBeenCalledWith('u1', 'e1');
    expect(callback).toHaveBeenCalledWith(null, { ok: true });
  });

  it('unregisterSubscription should return error if fields are missing', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();

    await handlers.unregisterSubscription(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ ok: false, error: 'MISSING_FIELDS' }));
  });

  it('listSubscriptions should return subscriptions', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();
    storeMock.getSubscriptions.mockResolvedValue([
      { endpoint: 'e1', keys: { p256dh: 'd1', auth: 'a1' } },
    ]);

    await handlers.listSubscriptions(call, callback);

    expect(storeMock.getSubscriptions).toHaveBeenCalledWith('u1');
    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      subscriptions: expect.arrayContaining([
        expect.objectContaining({ endpoint: 'e1' }),
      ]),
    }));
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
      },
    };
    const callback = vi.fn();
    pushServiceMock.sendToUser.mockResolvedValue({ success: 1, failure: 0 });

    await handlers.sendNotification(call, callback);

    expect(pushServiceMock.sendToUser).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ ok: true, successCount: 1 }));
  });

  it('sendNotification should return error if fields are missing', async () => {
    const call = { request: { userId: 'u1' } };
    const callback = vi.fn();

    await handlers.sendNotification(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ ok: false, error: 'MISSING_FIELDS' }));
  });

  it('should handle errors in handlers', async () => {
    const call = {
      request: {
        userId: 'u1',
        subscription: {
          endpoint: 'e1',
          keys: { p256dh: 'd1', auth: 'a1' },
        },
      },
    };
    const callback = vi.fn();
    storeMock.saveSubscription.mockRejectedValue(new Error('Internal Error'));

    await handlers.registerSubscription(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ ok: false, error: 'Internal Error' }));
  });
});
