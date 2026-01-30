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

export type PushDeliveryObserver = (result: PushDeliveryResult) => void | Promise<void>;

export type CreatePushDeliveryPipelineOptions = {
  /**
   * The subscription store for managing push subscriptions.
   */
  store: SubscriptionStore;

  /**
   * Custom observers to register instead of the default ones.
   * If not provided, default metrics and stats observers will be used.
   * Pass an empty array to disable all observers.
   */
  observers?: PushDeliveryObserver[];

  /**
   * Whether to include the default observers when custom observers are provided.
   * Only applies when `observers` is provided. Defaults to false.
   */
  includeDefaultObservers?: boolean;
};

/**
 * Creates the default set of observers for the push delivery pipeline.
 */
export function createDefaultObservers(store: SubscriptionStore): PushDeliveryObserver[] {
  return [createMetricsObserver(), createStatsObserver(store)];
}

export function createPushDeliveryPipeline(
  options: CreatePushDeliveryPipelineOptions,
): PushDeliveryPipeline {
  const { store, observers: customObservers, includeDefaultObservers = false } = options;

  const handler = createDeliveryHandler(store);
  const outcomes = createSubject<PushDeliveryResult>({
    onError: (err, { outcome }) => {
      logger.warn({ err: toError(err), outcome }, 'Push delivery observer error');
    },
  });

  // Determine which observers to register
  const observersToRegister: PushDeliveryObserver[] = [];

  if (customObservers === undefined) {
    // No custom observers provided - use defaults
    observersToRegister.push(...createDefaultObservers(store));
  } else {
    // Custom observers provided
    if (includeDefaultObservers) {
      observersToRegister.push(...createDefaultObservers(store));
    }
    observersToRegister.push(...customObservers);
  }

  // Register all observers
  for (const observer of observersToRegister) {
    outcomes.subscribe(observer);
  }

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
