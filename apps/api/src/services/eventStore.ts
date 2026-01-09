export interface HandEvent {
  eventId: string;
  handId: string;
  type: string;
  payload: Record<string, unknown>;
  ts: string;
}

import { getRedisClient } from "./redisClient";

export interface EventStore {
  append(event: HandEvent): Promise<void>;
  list(handId: string): Promise<HandEvent[]>;
  reset(): Promise<void>;
}

class InMemoryEventStore implements EventStore {
  private readonly eventsByHand = new Map<string, HandEvent[]>();

  async append(event: HandEvent) {
    const list = this.eventsByHand.get(event.handId) ?? [];
    list.push(event);
    this.eventsByHand.set(event.handId, list);
    console.log("event_store.append", {
      handId: event.handId,
      eventId: event.eventId,
      type: event.type,
    });
  }

  async list(handId: string) {
    return [...(this.eventsByHand.get(handId) ?? [])];
  }

  async reset() {
    this.eventsByHand.clear();
  }
}

class RedisEventStore implements EventStore {
  private readonly idsKey = "poker:handEvents:ids";

  private getKey(handId: string) {
    return `poker:handEvents:${handId}`;
  }

  async append(event: HandEvent) {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }
    const payload = JSON.stringify(event);
    await redis.rPush(this.getKey(event.handId), payload);
    await redis.sAdd(this.idsKey, event.handId);
  }

  async list(handId: string) {
    const redis = await getRedisClient();
    if (!redis) {
      return [];
    }
    const entries = await redis.lRange(this.getKey(handId), 0, -1);
    return entries.map((entry) => JSON.parse(entry) as HandEvent);
  }

  async reset() {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }
    const ids = await redis.sMembers(this.idsKey);
    const keys = ids.map((handId) => this.getKey(handId));
    if (keys.length > 0) {
      await redis.del(keys);
    }
    await redis.del(this.idsKey);
  }
}

export function createInMemoryEventStore() {
  return new InMemoryEventStore();
}

export function createRedisEventStore() {
  return new RedisEventStore();
}

const inMemoryStore = createInMemoryEventStore();
const redisStore = createRedisEventStore();

export const eventStore: EventStore = {
  async append(event: HandEvent) {
    await inMemoryStore.append(event);
    await redisStore.append(event);
  },
  async list(handId: string) {
    const redis = await getRedisClient();
    if (redis) {
      const events = await redisStore.list(handId);
      if (events.length > 0) {
        return events;
      }
    }
    return inMemoryStore.list(handId);
  },
  async reset() {
    await inMemoryStore.reset();
    await redisStore.reset();
  },
};

export function resetEventStore() {
  return eventStore.reset();
}
