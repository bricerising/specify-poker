import type { NotificationPayload, PushSubscription } from '../domain/types';
import type { PushSendResult, PushSender } from './pushSender';
import type { SubscriptionService } from './subscriptionService';

export type NotifyService = {
  registerSubscription(userId: string, subscription: PushSubscription): Promise<void>;
  unregisterSubscription(userId: string, endpoint: string): Promise<void>;
  listSubscriptions(userId: string): Promise<PushSubscription[]>;
  sendNotification(userId: string, payload: NotificationPayload): Promise<PushSendResult>;
};

export function createNotifyService(deps: {
  subscriptionService: SubscriptionService;
  pushSender: PushSender;
}): NotifyService {
  return {
    registerSubscription: async (userId, subscription) => {
      await deps.subscriptionService.register(userId, subscription);
    },
    unregisterSubscription: async (userId, endpoint) => {
      await deps.subscriptionService.unregister(userId, endpoint);
    },
    listSubscriptions: async (userId) => {
      return deps.subscriptionService.getSubscriptions(userId);
    },
    sendNotification: async (userId, payload) => {
      return deps.pushSender.sendToUser(userId, payload);
    },
  };
}
