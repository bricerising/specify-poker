import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PushSenderService } from '../../src/services/pushSenderService';
import { SubscriptionStore } from '../../src/storage/subscriptionStore';
import webpush from 'web-push';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

describe('PushSenderService', () => {
  let pushService: PushSenderService;
  let storeMock: unknown;

  beforeEach(() => {
    storeMock = {
      getSubscriptions: vi.fn(),
      deleteSubscription: vi.fn(),
      incrementStat: vi.fn(),
    };
    pushService = new PushSenderService(storeMock as unknown as SubscriptionStore);
    vi.clearAllMocks();
  });

  it('should send notification to all user subscriptions', async () => {
    const userId = 'user1';
    const sub1 = { endpoint: 'ep1', keys: { p256dh: 'dh1', auth: 'a1' } };
    const sub2 = { endpoint: 'ep2', keys: { p256dh: 'dh2', auth: 'a2' } };
    storeMock.getSubscriptions.mockResolvedValue([sub1, sub2]);
    (webpush.sendNotification as unknown).mockResolvedValue({});

    const result = await pushService.sendToUser(userId, { title: 'T', body: 'B' });

    expect(result.success).toBe(2);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(storeMock.incrementStat).toHaveBeenCalledWith('success');
  });

  it('should handle and cleanup expired subscriptions', async () => {
    const userId = 'user1';
    const sub1 = { endpoint: 'ep1', keys: { p256dh: 'dh1', auth: 'a1' } };
    storeMock.getSubscriptions.mockResolvedValue([sub1]);
    (webpush.sendNotification as unknown).mockRejectedValue({ statusCode: 410 });

    const result = await pushService.sendToUser(userId, { title: 'T', body: 'B' });

    expect(result.failure).toBe(1);
    expect(storeMock.deleteSubscription).toHaveBeenCalledWith(userId, 'ep1');
    expect(storeMock.incrementStat).toHaveBeenCalledWith('cleanup');
  });
});
