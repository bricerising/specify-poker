export interface PushSubscriptionPayload {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

const subscriptions = new Map<string, PushSubscriptionPayload[]>();

export const pushNotifications = {
  register(userId: string, subscription: PushSubscriptionPayload) {
    const list = subscriptions.get(userId) ?? [];
    const exists = list.some((item) => item.endpoint === subscription.endpoint);
    if (!exists) {
      list.push(subscription);
      subscriptions.set(userId, list);
    }
  },
  unregister(userId: string, endpoint: string) {
    const list = subscriptions.get(userId) ?? [];
    const next = list.filter((item) => item.endpoint !== endpoint);
    subscriptions.set(userId, next);
  },
  list(userId: string) {
    return subscriptions.get(userId) ?? [];
  },
  clear() {
    subscriptions.clear();
  },
};
