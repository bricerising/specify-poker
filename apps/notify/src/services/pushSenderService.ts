import webpush from "web-push";
import { NotificationPayload } from "../domain/types";
import { SubscriptionStore } from "../storage/subscriptionStore";
import { getConfig } from "../config";
import logger from "../observability/logger";
import { recordPushDelivery } from "../observability/metrics";

export class PushSenderService {
  private subscriptionStore: SubscriptionStore;

  constructor(subscriptionStore: SubscriptionStore) {
    this.subscriptionStore = subscriptionStore;

    const config = getConfig();
    const publicVapidKey = config.vapidPublicKey;
    const privateVapidKey = config.vapidPrivateKey;
    const vapidSubject = config.vapidSubject;

    if (publicVapidKey && privateVapidKey) {
      webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
    } else {
      logger.warn("VAPID keys not set. Push notifications will fail.");
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
          recordPushDelivery("success");
          return { ok: true };
        } catch (error: unknown) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            logger.info({ userId, endpoint: sub.endpoint }, "Removing expired subscription");
            await this.subscriptionStore.deleteSubscription(userId, sub.endpoint);
            await this.subscriptionStore.incrementStat('cleanup');
            recordPushDelivery("cleanup");
          } else {
            logger.error({ err: error, userId, endpoint: sub.endpoint }, "Failed to send notification");
            await this.subscriptionStore.incrementStat('failure');
            recordPushDelivery("failure");
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
