import { getRedisClient } from './redisClient';
import type { UserPushSubscription, PushSubscription } from '../domain/types';
import logger from '../observability/logger';
import { toError } from '../shared/errors';
import { isRecord } from '../shared/decoders';

const KEY_PREFIX = 'notify:push:';
const STATS_KEY = 'notify:stats';

function isPushKeys(value: unknown): value is PushSubscription['keys'] {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.p256dh === 'string' && typeof value.auth === 'string';
}

function isUserPushSubscription(value: unknown): value is UserPushSubscription {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.userId === 'string' &&
    typeof value.endpoint === 'string' &&
    typeof value.createdAt === 'string' &&
    isPushKeys(value.keys)
  );
}

function parseUserPushSubscription(
  serialized: string,
  context: { userId: string; endpoint: string },
): UserPushSubscription | null {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isUserPushSubscription(parsed)) {
      return null;
    }
    return parsed;
  } catch (error: unknown) {
    logger.warn(
      { err: toError(error), userId: context.userId, endpoint: context.endpoint },
      'Failed to parse stored subscription JSON',
    );
    return null;
  }
}

export type SubscriptionStoreRedisClient = {
  hSet(key: string, field: string, value: string): Promise<unknown>;
  hDel(key: string, field: string): Promise<unknown>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, increment: number): Promise<unknown>;
};

export type SubscriptionStoreDeps = {
  getClient?: () => Promise<SubscriptionStoreRedisClient>;
  now?: () => Date;
};

export class SubscriptionStore {
  constructor(private readonly deps: SubscriptionStoreDeps = {}) {}

  private async getClient(): Promise<SubscriptionStoreRedisClient> {
    return (this.deps.getClient ?? getRedisClient)();
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  async saveSubscription(userId: string, subscription: PushSubscription): Promise<void> {
    const client = await this.getClient();
    const key = `${KEY_PREFIX}${userId}`;
    const data: UserPushSubscription = {
      ...subscription,
      userId,
      createdAt: this.now().toISOString(),
    };
    await client.hSet(key, subscription.endpoint, JSON.stringify(data));
  }

  async deleteSubscription(userId: string, endpoint: string): Promise<void> {
    const client = await this.getClient();
    const key = `${KEY_PREFIX}${userId}`;
    await client.hDel(key, endpoint);
  }

  async getSubscriptions(userId: string): Promise<UserPushSubscription[]> {
    const client = await this.getClient();
    const key = `${KEY_PREFIX}${userId}`;
    const all = await client.hGetAll(key);
    const subscriptions: UserPushSubscription[] = [];

    for (const [endpoint, serialized] of Object.entries(all)) {
      const parsed = parseUserPushSubscription(serialized, { userId, endpoint });
      if (!parsed) {
        continue;
      }

      if (parsed.userId !== userId) {
        logger.warn(
          { userId, parsedUserId: parsed.userId, endpoint },
          'Ignoring subscription stored under unexpected userId',
        );
        continue;
      }

      if (parsed.endpoint !== endpoint) {
        subscriptions.push({ ...parsed, endpoint });
        continue;
      }

      subscriptions.push(parsed);
    }

    return subscriptions;
  }

  async incrementStat(field: 'success' | 'failure' | 'cleanup'): Promise<void> {
    const client = await this.getClient();
    await client.hIncrBy(STATS_KEY, field, 1);
  }
}
