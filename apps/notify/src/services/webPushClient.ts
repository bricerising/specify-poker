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

function hasVapidKeys(
  details: VapidDetails | undefined,
): details is VapidDetails & { publicKey: string; privateKey: string } {
  return Boolean(details?.publicKey && details.privateKey);
}

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
   * returns a no-op client outside production.
   */
  vapidDetails?: VapidDetails;

  /**
   * Force creation of a real client even without VAPID keys.
   * Useful when VAPID is configured elsewhere (e.g., via configureVapid).
   */
  forceReal?: boolean;
};

type WebPushClientVariant = 'real' | 'noop';

function resolveWebPushClientVariant(
  options: CreateWebPushClientOptions,
  nodeEnv: string | undefined,
): WebPushClientVariant {
  if (hasVapidKeys(options.vapidDetails)) {
    return 'real';
  }

  if (options.forceReal) {
    return 'real';
  }

  if (nodeEnv === 'production') {
    return 'real';
  }

  return 'noop';
}

/**
 * Creates a WebPushClient, automatically falling back to a no-op client
 * when VAPID keys are not configured outside production.
 */
export function createWebPushClient(options: CreateWebPushClientOptions = {}): WebPushClient {
  const nodeEnv = process.env.NODE_ENV;

  const variant = resolveWebPushClientVariant(options, nodeEnv);

  if (variant === 'noop') {
    if (nodeEnv !== 'test') {
      logger.warn('VAPID keys not set. Push notifications are disabled (no-op).');
    }
    return createNoOpWebPushClient();
  }

  if (hasVapidKeys(options.vapidDetails)) {
    configureVapid(options.vapidDetails);
    return createRealWebPushClient();
  }

  if (!options.forceReal) {
    logger.warn('VAPID keys not set. Push notifications will fail.');
  }

  return createRealWebPushClient();
}
