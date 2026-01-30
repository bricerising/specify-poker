import { createSubject, type Subject } from '@specify-poker/shared';
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

export type PushDeliveryResult = {
  attempt: PushDeliveryAttempt;
  outcome: PushDeliveryOutcome;
};

export type PushDeliveryPipeline = {
  handle(attempt: PushDeliveryAttempt): Promise<PushDeliveryOutcome>;
  /** Subject for observing delivery outcomes. */
  outcomes: Subject<PushDeliveryResult>;
};

type PushDeliveryHandler = (attempt: PushDeliveryAttempt) => Promise<PushDeliveryOutcome>;

/** Observer that records metrics for delivery outcomes */
function createMetricsObserver() {
  return ({ outcome }: PushDeliveryResult) => {
    try {
      recordPushDelivery(outcome);
    } catch (error: unknown) {
      logger.warn({ err: toError(error), outcome }, 'Failed to record push delivery metric');
    }
  };
}

/** Observer that records stats to the store */
function createStatsObserver(store: SubscriptionStore) {
  return async ({ outcome }: PushDeliveryResult) => {
    try {
      await store.incrementStat(outcome);
    } catch (error: unknown) {
      logger.warn({ err: toError(error), outcome }, 'Failed to record push delivery stats');
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

export function createPushDeliveryPipeline(store: SubscriptionStore): PushDeliveryPipeline {
  const handler = createDeliveryHandler(store);
  const outcomes = createSubject<PushDeliveryResult>({
    onError: (err, { outcome }) => {
      logger.warn({ err: toError(err), outcome }, 'Push delivery observer error');
    },
  });

  // Register default observers
  outcomes.subscribe(createMetricsObserver());
  outcomes.subscribe(createStatsObserver(store));

  return {
    outcomes,
    async handle(attempt) {
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

      await outcomes.notify({ attempt, outcome });
      return outcome;
    },
  };
}
