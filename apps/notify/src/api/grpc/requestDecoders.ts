import {
  isNotificationType,
  type NotificationPayload,
  type PushSubscription,
} from '../../domain/types';
import { asNonEmptyString, asOptionalString, isRecord, isStringRecord } from '../../shared/decoders';
import { err, ok, type Result } from '../../shared/result';

function resolveNotificationData(data: unknown): NotificationPayload['data'] | undefined {
  if (!data || !isStringRecord(data) || Object.keys(data).length === 0) {
    return undefined;
  }

  const rawType = data.type;
  const type = rawType && isNotificationType(rawType) ? rawType : 'system';
  return {
    ...data,
    type,
  };
}

export type DecodeMissingFieldsError = 'MISSING_FIELDS';

export type RegisterSubscriptionInput = {
  userId: string;
  subscription: PushSubscription;
};

export function decodeRegisterSubscriptionRequest(
  request: unknown,
): Result<RegisterSubscriptionInput, DecodeMissingFieldsError> {
  if (!isRecord(request)) {
    return err('MISSING_FIELDS');
  }

  const userId = asNonEmptyString(request.userId);
  const subscriptionRecord = request.subscription;
  if (!userId || !isRecord(subscriptionRecord)) {
    return err('MISSING_FIELDS');
  }

  const endpoint = asNonEmptyString(subscriptionRecord.endpoint);
  const keysRecord = subscriptionRecord.keys;
  if (!endpoint || !isRecord(keysRecord)) {
    return err('MISSING_FIELDS');
  }

  const p256dh = asNonEmptyString(keysRecord.p256dh);
  const auth = asNonEmptyString(keysRecord.auth);
  if (!p256dh || !auth) {
    return err('MISSING_FIELDS');
  }

  return ok({
    userId,
    subscription: {
      endpoint,
      keys: {
        p256dh,
        auth,
      },
    },
  });
}

export type UnregisterSubscriptionInput = {
  userId: string;
  endpoint: string;
};

export function decodeUnregisterSubscriptionRequest(
  request: unknown,
): Result<UnregisterSubscriptionInput, DecodeMissingFieldsError> {
  if (!isRecord(request)) {
    return err('MISSING_FIELDS');
  }

  const userId = asNonEmptyString(request.userId);
  const endpoint = asNonEmptyString(request.endpoint);
  if (!userId || !endpoint) {
    return err('MISSING_FIELDS');
  }

  return ok({ userId, endpoint });
}

export function decodeListSubscriptionsRequest(request: unknown): { userId: string | null } {
  if (!isRecord(request)) {
    return { userId: null };
  }

  const userId = asNonEmptyString(request.userId);
  return { userId };
}

export type SendNotificationInput = {
  userId: string;
  payload: NotificationPayload;
};

export function decodeSendNotificationRequest(
  request: unknown,
): Result<SendNotificationInput, DecodeMissingFieldsError> {
  if (!isRecord(request)) {
    return err('MISSING_FIELDS');
  }

  const userId = asNonEmptyString(request.userId);
  const title = asNonEmptyString(request.title);
  const body = asNonEmptyString(request.body);
  if (!userId || !title || !body) {
    return err('MISSING_FIELDS');
  }

  const payload: NotificationPayload = {
    title,
    body,
    url: asOptionalString(request.url),
    icon: asOptionalString(request.icon),
    tag: asOptionalString(request.tag),
    data: resolveNotificationData(request.data),
  };

  return ok({ userId, payload });
}
