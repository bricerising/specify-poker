import { api } from './apiClient';
import type { ApiClient } from './apiClient';
import { createJsonApiClient } from './jsonApiClient';

export type PushClient = {
  registerPushSubscription(subscription: PushSubscriptionJSON): Promise<void>;
  unregisterPushSubscription(endpoint: string): Promise<void>;
};

export function createPushClient(client: ApiClient): PushClient {
  const jsonClient = createJsonApiClient(client);

  const registerPushSubscription: PushClient['registerPushSubscription'] = async (subscription) => {
    await jsonClient.request('/api/push/subscribe', {
      method: 'POST',
      json: subscription,
    });
  };

  const unregisterPushSubscription: PushClient['unregisterPushSubscription'] = async (endpoint) => {
    await jsonClient.request('/api/push/subscribe', {
      method: 'DELETE',
      json: { endpoint },
    });
  };

  return { registerPushSubscription, unregisterPushSubscription };
}

export const pushClient = createPushClient(api);

export const registerPushSubscription: PushClient['registerPushSubscription'] = (...args) =>
  pushClient.registerPushSubscription(...args);
export const unregisterPushSubscription: PushClient['unregisterPushSubscription'] = (...args) =>
  pushClient.unregisterPushSubscription(...args);
