import webpush from 'web-push';
import type { PushSubscription } from '../domain/types';
import logger from '../observability/logger';

export type WebPushClient = {
  sendNotification(subscription: PushSubscription, payload: string): Promise<void>;
};

export type VapidDetails = {
  subject: string;
  publicKey: string | null;
  privateKey: string | null;
};

export function configureVapid(details: VapidDetails): void {
  if (details.publicKey && details.privateKey) {
    webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
    return;
  }

  if (process.env.NODE_ENV !== 'test') {
    logger.warn('VAPID keys not set. Push notifications will fail.');
  }
}

export function createWebPushClient(): WebPushClient {
  return {
    sendNotification: async (subscription, payload) => {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        payload,
      );
    },
  };
}
