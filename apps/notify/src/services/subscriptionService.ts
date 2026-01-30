import type { PushSubscription } from '../domain/types';
import type { SubscriptionStore } from '../storage/subscriptionStore';

export class SubscriptionService {
  constructor(private readonly store: SubscriptionStore) {}

  async register(userId: string, subscription: PushSubscription): Promise<void> {
    await this.store.saveSubscription(userId, subscription);
  }

  async unregister(userId: string, endpoint: string): Promise<void> {
    await this.store.deleteSubscription(userId, endpoint);
  }

  async getSubscriptions(userId: string): Promise<PushSubscription[]> {
    const subscriptions = await this.store.getSubscriptions(userId);
    return subscriptions.map((subscription) => ({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    }));
  }
}
