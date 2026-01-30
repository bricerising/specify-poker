export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface UserPushSubscription extends PushSubscription {
  userId: string;
  createdAt: string;
}

export const NOTIFICATION_TYPES = ['turn_alert', 'game_invite', 'system'] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  data?: {
    tableId?: string;
    type: NotificationType;
    [key: string]: string | undefined;
  };
}
