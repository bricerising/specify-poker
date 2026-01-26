import { NotificationPayload } from "../domain/types";
import { SubscriptionStore } from "../storage/subscriptionStore";
import logger from "../observability/logger";
import { recordPushDelivery } from "../observability/metrics";
import { createWebPushClient, type WebPushClient } from "./webPushClient";

export class PushSenderService {
  constructor(
    private readonly subscriptionStore: SubscriptionStore,
    private readonly webPushClient: WebPushClient = createWebPushClient()
  ) {}

  private getStatusCode(error: unknown): number | null {
    if (!error || typeof error !== "object") {
      return null;
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode !== "number") {
      return null;
    }

    return statusCode;
  }

  async sendToUser(userId: string, payload: NotificationPayload): Promise<{ success: number; failure: number }> {
    const subscriptions = await this.subscriptionStore.getSubscriptions(userId);

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await this.webPushClient.sendNotification(sub, JSON.stringify(payload));
          await this.subscriptionStore.incrementStat("success");
          recordPushDelivery("success");
          return "success" as const;
        } catch (error: unknown) {
          const statusCode = this.getStatusCode(error);
          if (statusCode === 404 || statusCode === 410) {
            logger.info({ userId, endpoint: sub.endpoint }, "Removing expired subscription");
            await this.subscriptionStore.deleteSubscription(userId, sub.endpoint);
            await this.subscriptionStore.incrementStat("cleanup");
            recordPushDelivery("cleanup");
            return "failure" as const;
          }

          logger.error({ err: error, userId, endpoint: sub.endpoint }, "Failed to send notification");
          await this.subscriptionStore.incrementStat("failure");
          recordPushDelivery("failure");
          return "failure" as const;
        }
      })
    );

    const counts = results.reduce(
      (acc, result) => {
        if (result === "success") {
          acc.success += 1;
          return acc;
        }
        acc.failure += 1;
        return acc;
      },
      { success: 0, failure: 0 }
    );

    return counts;
  }
}
