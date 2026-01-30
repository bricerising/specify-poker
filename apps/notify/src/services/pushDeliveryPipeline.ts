import type { NotificationPayload, UserPushSubscription } from '../domain/types';
import logger from '../observability/logger';
import { recordPushDelivery } from '../observability/metrics';
import { toError } from '../shared/errors';
import type { SubscriptionStore } from '../storage/subscriptionStore';
import type { WebPushSendError } from './webPushClient';

export type PushDeliveryOutcome = 'success' | 'cleanup' | 'failure';

export type PushDeliveryAttempt = {
  userId: string;
  subscription: UserPushSubscription;
  payload: NotificationPayload;
  error?: WebPushSendError;
};

export type PushDeliveryPipeline = {
  handle(attempt: PushDeliveryAttempt): Promise<PushDeliveryOutcome>;
};

type PushDeliveryHandler = (attempt: PushDeliveryAttempt) => Promise<PushDeliveryOutcome>;

type PushDeliveryOutcomeRecorder = (outcome: PushDeliveryOutcome) => Promise<void>;

function createOutcomeRecorder(store: SubscriptionStore): PushDeliveryOutcomeRecorder {
  return async (status) => {
    try {
      recordPushDelivery(status);
    } catch (error: unknown) {
      logger.warn({ err: toError(error), status }, 'Failed to record push delivery metric');
    }

    try {
      await store.incrementStat(status);
    } catch (error: unknown) {
      logger.warn({ err: toError(error), status }, 'Failed to record push delivery stats');
    }
  };
}

function createDeliveryHandler(store: SubscriptionStore): PushDeliveryHandler {
  return async (attempt) => {
    if (!attempt.error) {
      return 'success';
    }

    if (attempt.error.type === 'ExpiredSubscription') {
      logger.info(
        { userId: attempt.userId, endpoint: attempt.subscription.endpoint },
        'Removing expired subscription',
      );

      try {
        await store.deleteSubscription(attempt.userId, attempt.subscription.endpoint);
        return 'cleanup';
      } catch (error: unknown) {
        logger.error(
          {
            err: toError(error),
            userId: attempt.userId,
            endpoint: attempt.subscription.endpoint,
          },
          'Failed to remove expired subscription',
        );
        return 'failure';
      }
    }

    logger.error(
      {
        err: attempt.error,
        userId: attempt.userId,
        endpoint: attempt.subscription.endpoint,
        statusCode: attempt.error.type === 'SendFailed' ? attempt.error.statusCode : undefined,
      },
      'Failed to send notification',
    );
    return 'failure';
  };
}

function withOutcomeRecording(
  handler: PushDeliveryHandler,
  recordOutcome: PushDeliveryOutcomeRecorder,
): PushDeliveryHandler {
  return async (attempt) => {
    let outcome: PushDeliveryOutcome;
    try {
      outcome = await handler(attempt);
    } catch (error: unknown) {
      logger.error(
        {
          err: toError(error),
          userId: attempt.userId,
          endpoint: attempt.subscription.endpoint,
        },
        'Unhandled error while handling push delivery attempt',
      );
      outcome = 'failure';
    }

    await recordOutcome(outcome);
    return outcome;
  };
}

export function createPushDeliveryPipeline(store: SubscriptionStore): PushDeliveryPipeline {
  const handler = createDeliveryHandler(store);
  const recorder = createOutcomeRecorder(store);

  return { handle: withOutcomeRecording(handler, recorder) };
}
