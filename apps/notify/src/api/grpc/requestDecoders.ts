import { err, ok, type Result } from '@specify-poker/shared';
import {
  isNotificationType,
  type NotificationPayload,
  type PushSubscription,
} from '../../domain/types';
import { asNonEmptyString, asOptionalString, isRecord, isStringRecord } from '../../shared/decoders';

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
  idempotencyKey: string;
};

export function decodeRegisterSubscriptionRequest(
  request: unknown,
): Result<RegisterSubscriptionInput, DecodeMissingFieldsError> {
  if (!isRecord(request)) {
    return err('MISSING_FIELDS');
  }

  const userId = asNonEmptyString(request.userId);
  const idempotencyKey = asNonEmptyString(request.idempotencyKey);
  const subscriptionRecord = request.subscription;
  if (!userId || !idempotencyKey || !isRecord(subscriptionRecord)) {
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
    idempotencyKey,
  });
}

export type UnregisterSubscriptionInput = {
  userId: string;
  endpoint: string;
  idempotencyKey: string;
};

export function decodeUnregisterSubscriptionRequest(
  request: unknown,
): Result<UnregisterSubscriptionInput, DecodeMissingFieldsError> {
  if (!isRecord(request)) {
    return err('MISSING_FIELDS');
  }

  const userId = asNonEmptyString(request.userId);
  const endpoint = asNonEmptyString(request.endpoint);
  const idempotencyKey = asNonEmptyString(request.idempotencyKey);
  if (!userId || !endpoint || !idempotencyKey) {
    return err('MISSING_FIELDS');
  }

  return ok({ userId, endpoint, idempotencyKey });
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
  idempotencyKey: string;
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
  const idempotencyKey = asNonEmptyString(request.idempotencyKey);
  if (!userId || !title || !body || !idempotencyKey) {
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

  return ok({ userId, payload, idempotencyKey });
}
