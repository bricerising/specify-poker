import webpush from 'web-push';
import { NotificationPayload, UserPushSubscription } from '../domain/types';
import { SubscriptionStore } from '../storage/subscriptionStore';

export class PushService {
  private subscriptionStore: SubscriptionStore;

  constructor(subscriptionStore: SubscriptionStore) {
    this.subscriptionStore = subscriptionStore;

    const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
    const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

    if (publicVapidKey && privateVapidKey) {
      webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
    } else {
      console.warn('VAPID keys not set. Push notifications will fail.');
    }
  }

  async sendToUser(userId: string, payload: NotificationPayload): Promise<{ success: number; failure: number }> {
    const subscriptions = await this.subscriptionStore.getSubscriptions(userId);
    let success = 0;
    let failure = 0;

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            JSON.stringify(payload)
          );
          await this.subscriptionStore.incrementStat('success');
          return { ok: true };
        } catch (error: any) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            console.info(`Removing expired subscription for user ${userId}: ${sub.endpoint}`);
            await this.subscriptionStore.deleteSubscription(userId, sub.endpoint);
            await this.subscriptionStore.incrementStat('cleanup');
          } else {
            console.error(`Failed to send notification to user ${userId}:`, error);
            await this.subscriptionStore.incrementStat('failure');
          }
          return { ok: false };
        }
      })
    );

    results.forEach((r) => {
      if (r.ok) success++;
      else failure++;
    });

    return { success, failure };
  }
}
