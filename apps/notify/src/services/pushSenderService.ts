import type { NotificationPayload, UserPushSubscription } from '../domain/types';
import type { SubscriptionStore } from '../storage/subscriptionStore';
import { createWebPushClient, type WebPushClient } from './webPushClient';
import {
  createPushDeliveryPipeline,
  type PushDeliveryOutcome,
  type PushDeliveryPipeline,
} from './pushDeliveryPipeline';
import type { PushSendResult, PushSender } from './pushSender';

export class PushSenderService implements PushSender {
  private readonly deliveryPipeline: PushDeliveryPipeline;

  constructor(
    private readonly subscriptionStore: SubscriptionStore,
    private readonly webPushClient: WebPushClient = createWebPushClient(),
  ) {
    this.deliveryPipeline = createPushDeliveryPipeline({ store: subscriptionStore });
  }

  private async sendToSubscription(
    userId: string,
    payload: NotificationPayload,
    payloadJson: string,
    subscription: UserPushSubscription,
  ): Promise<PushDeliveryOutcome> {
    const sendResult = await this.webPushClient.sendNotification(subscription, payloadJson);

    const outcome = await this.deliveryPipeline.handle({
      userId,
      subscription,
      payload,
      error: sendResult.ok ? undefined : sendResult.error,
    });

    return outcome;
  }

  async sendToUser(
    userId: string,
    payload: NotificationPayload,
  ): Promise<PushSendResult> {
    const subscriptions = await this.subscriptionStore.getSubscriptions(userId);
    if (subscriptions.length === 0) {
      return { success: 0, failure: 0 };
    }

    const payloadJson = JSON.stringify(payload);

    const outcomes = await Promise.all(
      subscriptions.map((subscription) =>
        this.sendToSubscription(userId, payload, payloadJson, subscription),
      ),
    );

    let success = 0;
    let failure = 0;

    for (const outcome of outcomes) {
      if (outcome === 'success') {
        success += 1;
        continue;
      }

      failure += 1;
    }

    return { success, failure };
  }
}
