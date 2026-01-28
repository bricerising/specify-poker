import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../../src/services/subscriptionService';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let storeMock: unknown;

  beforeEach(() => {
    storeMock = {
      saveSubscription: vi.fn(),
      deleteSubscription: vi.fn(),
      getSubscriptions: vi.fn().mockResolvedValue([]),
    };
    service = new SubscriptionService(storeMock);
  });

  it('register should save subscription', async () => {
    const subscription = { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } };
    await service.register('u1', subscription);
    expect(storeMock.saveSubscription).toHaveBeenCalledWith('u1', subscription);
  });

  it('unregister should delete subscription', async () => {
    await service.unregister('u1', 'e1');
    expect(storeMock.deleteSubscription).toHaveBeenCalledWith('u1', 'e1');
  });

  it('getSubscriptions should return stored subscriptions', async () => {
    const stored = [{ endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } }];
    storeMock.getSubscriptions.mockResolvedValue(stored);
    const result = await service.getSubscriptions('u1');
    expect(result).toEqual(stored);
  });
});
