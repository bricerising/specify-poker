import { getRedisClient } from "./redisClient";

export interface PushSubscriptionPayload {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

const subscriptions = new Map<string, PushSubscriptionPayload[]>();

function getPushKey(userId: string) {
  return `poker:push:${userId}`;
}

export const pushNotifications = {
  async register(userId: string, subscription: PushSubscriptionPayload) {
    let list = subscriptions.get(userId);
    if (!list) {
      const redis = await getRedisClient();
      if (redis) {
        const payload = await redis.get(getPushKey(userId));
        list = payload ? (JSON.parse(payload) as PushSubscriptionPayload[]) : [];
      } else {
        list = [];
      }
    }
    const exists = list.some((item) => item.endpoint === subscription.endpoint);
    if (!exists) {
      list.push(subscription);
      subscriptions.set(userId, list);
      const redis = await getRedisClient();
      if (redis) {
        await redis.set(getPushKey(userId), JSON.stringify(list));
      }
    }
  },
  async unregister(userId: string, endpoint: string) {
    let list = subscriptions.get(userId);
    if (!list) {
      const redis = await getRedisClient();
      if (redis) {
        const payload = await redis.get(getPushKey(userId));
        list = payload ? (JSON.parse(payload) as PushSubscriptionPayload[]) : [];
      } else {
        list = [];
      }
    }
    const next = list.filter((item) => item.endpoint !== endpoint);
    subscriptions.set(userId, next);
    const redis = await getRedisClient();
    if (redis) {
      await redis.set(getPushKey(userId), JSON.stringify(next));
    }
  },
  async list(userId: string) {
    const cached = subscriptions.get(userId);
    if (cached) {
      return cached;
    }
    const redis = await getRedisClient();
    if (!redis) {
      return [];
    }
    const payload = await redis.get(getPushKey(userId));
    if (!payload) {
      return [];
    }
    const parsed = JSON.parse(payload) as PushSubscriptionPayload[];
    subscriptions.set(userId, parsed);
    return parsed;
  },
  async clear() {
    subscriptions.clear();
    const redis = await getRedisClient();
    if (redis) {
      const keys = await redis.keys("poker:push:*");
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  },
};
