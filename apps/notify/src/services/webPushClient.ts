import webpush from 'web-push';
import { err, ok, type Result } from '@specify-poker/shared';
import type { PushSubscription } from '../domain/types';
import logger from '../observability/logger';
import { isRecord } from '../shared/decoders';
import { getErrorMessage } from '../shared/errors';

export type WebPushSendError =
  | { type: 'ExpiredSubscription'; statusCode: 404 | 410; message: string }
  | { type: 'SendFailed'; statusCode: number | null; message: string };

export type WebPushClient = {
  sendNotification(
    subscription: PushSubscription,
    payload: string,
  ): Promise<Result<void, WebPushSendError>>;
};

export type VapidDetails = {
  subject: string;
  publicKey: string | null;
  privateKey: string | null;
};

function getHttpStatusCode(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  const statusCode = error.statusCode;
  if (typeof statusCode !== 'number') {
    return null;
  }

  return statusCode;
}

function toWebPushSendError(error: unknown): WebPushSendError {
  const statusCode = getHttpStatusCode(error);
  const message = getErrorMessage(error);

  if (statusCode === 404 || statusCode === 410) {
    return { type: 'ExpiredSubscription', statusCode, message };
  }

  return { type: 'SendFailed', statusCode, message };
}

export function configureVapid(details: VapidDetails): void {
  if (details.publicKey && details.privateKey) {
    webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
    return;
  }

  if (process.env.NODE_ENV !== 'test') {
    logger.warn('VAPID keys not set. Push notifications will fail.');
  }
}

export function createWebPushClient(): WebPushClient {
  return {
    sendNotification: async (subscription, payload) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload,
        );
        return ok(undefined);
      } catch (error: unknown) {
        return err(toWebPushSendError(error));
      }
    },
  };
}
