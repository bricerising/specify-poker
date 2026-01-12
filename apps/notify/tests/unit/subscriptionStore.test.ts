import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionStore } from '../../src/storage/subscriptionStore';

// Mock redis
vi.mock('../../src/storage/redisClient', () => {
  const hSet = vi.fn();
  const hDel = vi.fn();
  const hGetAll = vi.fn();
  const hIncrBy = vi.fn();
  return {
    getRedisClient: () => Promise.resolve({
      hSet,
      hDel,
      hGetAll,
      hIncrBy,
    }),
  };
});

import { getRedisClient } from '../../src/storage/redisClient';

describe('SubscriptionStore', () => {
  let store: SubscriptionStore;
  let redisMock: unknown;

  beforeEach(async () => {
    store = new SubscriptionStore();
    redisMock = await getRedisClient();
    vi.clearAllMocks();
  });

  it('should save a subscription', async () => {
    const userId = 'user1';
    const sub = {
      endpoint: 'https://example.com/push',
      keys: { p256dh: 'dh', auth: 'auth' },
    };

    await store.saveSubscription(userId, sub);

    expect(redisMock.hSet).toHaveBeenCalledWith(
      `notify:push:${userId}`,
      sub.endpoint,
      expect.stringContaining(sub.endpoint)
    );
  });

  it('should delete a subscription', async () => {
    const userId = 'user1';
    const endpoint = 'https://example.com/push';

    await store.deleteSubscription(userId, endpoint);

    expect(redisMock.hDel).toHaveBeenCalledWith(`notify:push:${userId}`, endpoint);
  });

  it('should list subscriptions', async () => {
    const userId = 'user1';
    const sub = {
      userId,
      endpoint: 'https://example.com/push',
      keys: { p256dh: 'dh', auth: 'auth' },
      createdAt: new Date().toISOString(),
    };
    redisMock.hGetAll.mockResolvedValue({
      [sub.endpoint]: JSON.stringify(sub),
    });

    const results = await store.getSubscriptions(userId);

    expect(results).toHaveLength(1);
    expect(results[0].endpoint).toBe(sub.endpoint);
  });

  it('should increment stats', async () => {
    await store.incrementStat('success');
    expect(redisMock.hIncrBy).toHaveBeenCalledWith('notify:stats', 'success', 1);
  });
});
