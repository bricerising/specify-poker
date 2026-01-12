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

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
}
