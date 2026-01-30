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

/**
 * Null Object pattern: A no-op WebPushClient that always succeeds.
 * Useful for testing or when push notifications are disabled.
 */
export function createNoOpWebPushClient(): WebPushClient {
  return {
    sendNotification: async () => ok(undefined),
  };
}

/**
 * Creates a real WebPushClient that sends notifications via web-push.
 */
export function createRealWebPushClient(): WebPushClient {
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

export type CreateWebPushClientOptions = {
  /**
   * VAPID details for authentication. If not provided or keys are missing,
   * returns a no-op client in non-production environments.
   */
  vapidDetails?: VapidDetails;

  /**
   * Force creation of a real client even without VAPID keys.
   * Useful when VAPID is configured elsewhere (e.g., via configureVapid).
   */
  forceReal?: boolean;
};

/**
 * Creates a WebPushClient, automatically falling back to a no-op client
 * when VAPID keys are not configured (in non-test environments).
 */
export function createWebPushClient(options: CreateWebPushClientOptions = {}): WebPushClient {
  const { vapidDetails, forceReal = false } = options;

  // If VAPID details are provided and valid, configure and return real client
  if (vapidDetails?.publicKey && vapidDetails?.privateKey) {
    configureVapid(vapidDetails);
    return createRealWebPushClient();
  }

  // If forceReal is set, return real client regardless
  if (forceReal) {
    return createRealWebPushClient();
  }

  // In test environment, return no-op client silently
  if (process.env.NODE_ENV === 'test') {
    return createNoOpWebPushClient();
  }

  // In non-test environment without VAPID, log warning and return real client
  // (which will fail, but that's the existing behavior)
  logger.warn('VAPID keys not set. Push notifications will fail.');
  return createRealWebPushClient();
}
