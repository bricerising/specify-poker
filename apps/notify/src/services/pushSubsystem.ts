import type { SubscriptionStore } from '../storage/subscriptionStore';
import type { PushSender } from './pushSender';
import { withNotificationMetrics } from './pushSenderDecorators';
import { PushSenderService } from './pushSenderService';
import { createWebPushClient, type WebPushClient } from './webPushClient';

export type PushSubsystem = {
  pushSenderService: PushSenderService;
  pushSender: PushSender;
};

export type CreatePushSubsystemOptions = {
  subscriptionStore: SubscriptionStore;
  webPushClient?: WebPushClient;
};

export function createPushSubsystem(options: CreatePushSubsystemOptions): PushSubsystem {
  const pushSenderService = new PushSenderService(
    options.subscriptionStore,
    options.webPushClient ?? createWebPushClient(),
  );
  const pushSender = withNotificationMetrics(pushSenderService);

  return { pushSenderService, pushSender };
}

