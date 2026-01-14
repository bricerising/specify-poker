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

export type NotificationType = "turn_alert" | "game_invite" | "system";

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
