import {
  createRedisClientManager,
  runRedisStreamConsumer,
  type RedisStreamConsumerClient,
  type RedisStreamConsumerMessage,
} from '@specify-poker/shared/redis';
import { incrementHandsPlayed, incrementWins } from './statisticsService';
import logger from '../observability/logger';
import { decodeStructLike } from '@specify-poker/shared';
import { getConfig } from '../config';
import { asError } from '../domain/errors';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

type StatisticsService = {
  incrementHandsPlayed(userId: string): Promise<unknown>;
  incrementWins(userId: string): Promise<unknown>;
};

type HandEventType = 'HAND_STARTED' | 'HAND_ENDED';

type HandEvent = {
  type: HandEventType;
  payload: unknown;
};

type HandEventPayload = Record<string, unknown>;

type HandEventStrategy = {
  type: HandEventType;
  handle(payload: HandEventPayload): Promise<void>;
};

function asHandEventType(value: unknown): HandEventType | null {
  if (value === 'HAND_STARTED' || value === 'HAND_ENDED') {
    return value;
  }
  return null;
}

function decodeHandEvent(event: unknown): HandEvent | null {
  if (!isRecord(event)) {
    return null;
  }

  const type = asHandEventType(event.type);
  if (!type) {
    return null;
  }

  return { type, payload: event.payload };
}

function listOfNonEmptyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const trimmed = item.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result;
}

async function applyStatisticUpdates(
  userIds: readonly string[],
  update: (userId: string) => Promise<unknown>,
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  const results = await Promise.allSettled(userIds.map((userId) => update(userId)));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      return;
    }

    logger.error(
      { err: asError(result.reason), userId: userIds[index] },
      'eventConsumer.statisticsUpdate.failed',
    );
  });
}

function createHandEventStrategyMap(
  strategies: readonly HandEventStrategy[],
): ReadonlyMap<HandEventType, HandEventStrategy> {
  const byType = new Map<HandEventType, HandEventStrategy>();
  for (const strategy of strategies) {
    byType.set(strategy.type, strategy);
  }
  return byType;
}

export function createHandEventStrategies(
  statisticsService: StatisticsService,
): readonly HandEventStrategy[] {
  return [
    {
      type: 'HAND_STARTED',
      handle: async (payload) => {
        const participants = listOfNonEmptyStrings(payload.participants);
        await applyStatisticUpdates(participants, async (userId) => {
          await statisticsService.incrementHandsPlayed(userId);
        });
      },
    },
    {
      type: 'HAND_ENDED',
      handle: async (payload) => {
        const winnerUserIds = listOfNonEmptyStrings(payload.winnerUserIds);
        await applyStatisticUpdates(winnerUserIds, async (userId) => {
          await statisticsService.incrementWins(userId);
        });
      },
    },
  ];
}

function createRedisAccessors(options: EventConsumerOptions): {
  getClient: () => Promise<RedisStreamConsumerClient | null>;
  closeClient: () => Promise<void>;
} {
  if (options.getRedisClient) {
    return {
      getClient: options.getRedisClient,
      closeClient: options.closeRedisClient ?? (async () => undefined),
    };
  }

  const url = options.redisUrl ?? getConfig().redisUrl;
  let manager: ReturnType<typeof createRedisClientManager> | null = null;

  const getManager = () => {
    if (!manager) {
      manager = createRedisClientManager({ url, log: logger, name: 'player-event-consumer' });
    }
    return manager;
  };

  return {
    getClient: async () => {
      return await getManager().getBlockingClientOrNull();
    },
    closeClient: async () => {
      if (!manager) {
        return;
      }
      await manager.close();
      manager = null;
    },
  };
}

type SleepFn = (ms: number) => Promise<void>;

type EventConsumerOptions = {
  streamKey?: string;
  groupName?: string;
  consumerName?: string;
  getRedisClient?: () => Promise<RedisStreamConsumerClient | null>;
  closeRedisClient?: () => Promise<void>;
  blockMs?: number;
  readCount?: number;
  sleep?: SleepFn;
  statistics?: StatisticsService;
  redisUrl?: string | null;
};

export class EventConsumer {
  private isRunning: boolean = false;
  private readonly streamKey: string;
  private readonly groupName: string;
  private readonly consumerName: string;
  private readonly getClient: () => Promise<RedisStreamConsumerClient | null>;
  private readonly closeClient: () => Promise<void>;
  private readonly blockMs: number;
  private readonly readCount: number;
  private readonly sleep: SleepFn;
  private pollPromise: Promise<void> | null = null;
  private readonly strategyByType: ReadonlyMap<HandEventType, HandEventStrategy>;
  private abortController: AbortController | null = null;

  constructor(options: EventConsumerOptions = {}) {
    this.streamKey = options.streamKey ?? 'events:all';
    this.groupName = options.groupName ?? 'player-service';
    this.consumerName = options.consumerName ?? `consumer-${process.pid}`;
    this.blockMs = options.blockMs ?? 5000;
    this.readCount = options.readCount ?? 10;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    const statistics = options.statistics ?? { incrementHandsPlayed, incrementWins };
    this.strategyByType = createHandEventStrategyMap(createHandEventStrategies(statistics));

    const redis = createRedisAccessors(options);
    this.getClient = redis.getClient;
    this.closeClient = redis.closeClient;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const client = await this.getClient();
    if (!client) {
      logger.warn('Redis not available, EventConsumer will not start');
      return;
    }

    this.isRunning = true;
    logger.info('Player EventConsumer started');

    const controller = new AbortController();
    this.abortController = controller;

    this.pollPromise = runRedisStreamConsumer(controller.signal, {
      streamKey: this.streamKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      getClient: async () => {
        const nextClient = await this.getClient();
        if (!nextClient) {
          throw new Error('player_event_consumer.redis_not_available');
        }
        return nextClient;
      },
      onMessage: async (message) => {
        await this.handleStreamMessage(message);
      },
      blockMs: this.blockMs,
      readCount: this.readCount,
      sleep: this.sleep,
      logger,
    }).catch((error: unknown) => {
      if (!this.isRunning) {
        return;
      }
      logger.error({ err: error }, 'EventConsumer poll loop crashed');
    });
  }

  private async handleStreamMessage(message: RedisStreamConsumerMessage): Promise<void> {
    const rawData = message.fields.data;
    if (typeof rawData !== 'string') {
      logger.warn({ messageId: message.id }, 'eventConsumer.invalidMessage');
      return;
    }

    const parsed = safeJsonParse(rawData);
    if (!parsed) {
      logger.warn({ messageId: message.id }, 'eventConsumer.invalidJson');
      return;
    }

    await this.handleEvent(parsed);
  }

  async handleEvent(event: unknown): Promise<void> {
    try {
      const decoded = decodeHandEvent(event);
      if (!decoded) {
        return;
      }

      const strategy = this.strategyByType.get(decoded.type);
      if (!strategy) {
        return;
      }

      const payload = decodeStructLike(decoded.payload);
      await strategy.handle(payload);
    } catch (error: unknown) {
      logger.error({ err: asError(error) }, 'eventConsumer.handleEvent.failed');
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.abortController?.abort();
    await this.closeClient();
    if (this.pollPromise) {
      await this.pollPromise.catch(() => undefined);
      this.pollPromise = null;
    }
    this.abortController = null;
  }
}
