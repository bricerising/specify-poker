import type { NotificationPayload } from '../domain/types';

export type PushSendResult = { success: number; failure: number };

export type PushSender = {
  sendToUser(userId: string, payload: NotificationPayload): Promise<PushSendResult>;
};

