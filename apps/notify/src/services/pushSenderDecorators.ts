import { recordNotificationRequested } from '../observability/metrics';
import type { PushSender } from './pushSender';

export function withNotificationMetrics(pushSender: PushSender): PushSender {
  return {
    sendToUser: async (userId, payload) => {
      recordNotificationRequested(payload.data?.type ?? 'system');
      return pushSender.sendToUser(userId, payload);
    },
  };
}

