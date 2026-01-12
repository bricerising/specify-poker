import { getRedisClient } from './redisClient';
import { UserPushSubscription, PushSubscription } from '../domain/types';

const KEY_PREFIX = 'notify:push:';

export class SubscriptionStore {
  async saveSubscription(userId: string, subscription: PushSubscription): Promise<void> {
    const client = await getRedisClient();
    const key = `${KEY_PREFIX}${userId}`;
    const data: UserPushSubscription = {
      ...subscription,
      userId,
      createdAt: new Date().toISOString(),
    };
    await client.hSet(key, subscription.endpoint, JSON.stringify(data));
  }

  async deleteSubscription(userId: string, endpoint: string): Promise<void> {
    const client = await getRedisClient();
    const key = `${KEY_PREFIX}${userId}`;
    await client.hDel(key, endpoint);
  }

  async getSubscriptions(userId: string): Promise<UserPushSubscription[]> {
    const client = await getRedisClient();
    const key = `${KEY_PREFIX}${userId}`;
    const all = await client.hGetAll(key);
    return Object.values(all).map((val) => JSON.parse(val));
  }

  async incrementStat(field: 'success' | 'failure' | 'cleanup'): Promise<void> {
    const client = await getRedisClient();
    await client.hIncrBy('notify:stats', field, 1);
  }
}
