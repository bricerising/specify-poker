import * as grpc from '@grpc/grpc-js';
import { SubscriptionStore } from '../../storage/subscriptionStore';
import { PushService } from '../../services/pushService';
import { PushSubscription, NotificationPayload } from '../../domain/types';

export function createHandlers(subscriptionStore: SubscriptionStore, pushService: PushService) {
  return {
    registerSubscription: async (call: any, callback: any) => {
      try {
        const { userId, subscription } = call.request;
        if (!userId || !subscription || !subscription.endpoint || !subscription.keys) {
          return callback(null, { ok: false, error: 'MISSING_FIELDS' });
        }

        const sub: PushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        };

        await subscriptionStore.saveSubscription(userId, sub);
        callback(null, { ok: true });
      } catch (error: any) {
        callback(null, { ok: false, error: error.message });
      }
    },

    unregisterSubscription: async (call: any, callback: any) => {
      try {
        const { userId, endpoint } = call.request;
        if (!userId || !endpoint) {
          return callback(null, { ok: false, error: 'MISSING_FIELDS' });
        }

        await subscriptionStore.deleteSubscription(userId, endpoint);
        callback(null, { ok: true });
      } catch (error: any) {
        callback(null, { ok: false, error: error.message });
      }
    },

    listSubscriptions: async (call: any, callback: any) => {
      try {
        const { userId } = call.request;
        if (!userId) {
          return callback(null, { subscriptions: [] });
        }

        const subscriptions = await subscriptionStore.getSubscriptions(userId);
        callback(null, {
          subscriptions: subscriptions.map((s) => ({
            endpoint: s.endpoint,
            keys: {
              p256dh: s.keys.p256dh,
              auth: s.keys.auth,
            },
          })),
        });
      } catch (error: any) {
        callback(error);
      }
    },

    sendNotification: async (call: any, callback: any) => {
      try {
        const { userId, title, body, url, icon, tag, data } = call.request;
        if (!userId || !title || !body) {
          return callback(null, { ok: false, error: 'MISSING_FIELDS' });
        }

        const payload: NotificationPayload = {
          title,
          body,
          url,
          icon,
          tag,
          data,
        };

        const result = await pushService.sendToUser(userId, payload);
        callback(null, {
          ok: true,
          successCount: result.success,
          failureCount: result.failure,
        });
      } catch (error: any) {
        callback(null, { ok: false, error: error.message });
      }
    },
  };
}
