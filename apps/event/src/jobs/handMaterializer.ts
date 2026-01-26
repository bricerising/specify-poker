import { blockingRedisClient } from "../storage/redisClient";
import { eventStore } from "../storage/eventStore";
import { handStore } from "../storage/handStore";
import {
  ActionTakenPayload,
  Card,
  GameEvent,
  HandCompletedPayload,
  HandRecord,
  HandStartedPayload,
  PotAwardedPayload,
  ShowdownPayload,
  StreetAdvancedPayload,
} from "../domain/types";
import { recordMaterializationLag } from "../observability/metrics";

export interface HandMaterializerDependencies {
  redisClient: typeof blockingRedisClient;
  eventStore: typeof eventStore;
  handStore: typeof handStore;
  recordMaterializationLag: typeof recordMaterializationLag;
}

type ParticipantRecord = {
  seatId: number;
  userId: string;
  nickname: string;
  startingStack: number;
  endingStack: number;
  holeCards: Card[] | null;
  actions: { street: string; action: string; amount: number; timestamp: string }[];
  result: "WON" | "LOST" | "FOLDED" | "SPLIT";
};

type AggregationContext = {
  participants: Map<string, ParticipantRecord>;
  participantsBySeat: Map<number, string>;
  communityCards: Card[];
  pots: { amount: number; winners: string[] }[];
  winners: { userId: string; amount: number }[];
};

type MaterializableEventType =
  | "HAND_STARTED"
  | "CARDS_DEALT"
  | "ACTION_TAKEN"
  | "STREET_ADVANCED"
  | "SHOWDOWN"
  | "POT_AWARDED"
  | "HAND_COMPLETED";

type MaterializerEventHandler = (ctx: AggregationContext, event: GameEvent) => void;

const materializerEventHandlers = {
  HAND_STARTED: (ctx: AggregationContext, event: GameEvent) => {
    const payload = event.payload as HandStartedPayload;
    const seats = getSeats(payload, event.payload);
    seats.forEach((seat) => {
      ctx.participants.set(seat.userId, {
        seatId: seat.seatId,
        userId: seat.userId,
        nickname: seat.nickname || `Player ${seat.seatId}`,
        startingStack: seat.stack,
        endingStack: seat.stack,
        holeCards: null,
        actions: [],
        result: "LOST",
      });
      ctx.participantsBySeat.set(seat.seatId, seat.userId);
    });
  },
  CARDS_DEALT: (ctx: AggregationContext, event: GameEvent) => {
    if (!event.userId) {
      return;
    }
    const payload = event.payload as { cards?: Card[] };
    const participant = ctx.participants.get(event.userId);
    if (participant) {
      participant.holeCards = payload.cards || null;
    }
  },
  ACTION_TAKEN: (ctx: AggregationContext, event: GameEvent) => {
    if (!event.userId) {
      return;
    }
    const payload = event.payload as ActionTakenPayload;
    const participant = ctx.participants.get(event.userId);
    if (!participant) {
      return;
    }
    participant.actions.push({
      street: payload.street || "unknown",
      action: payload.action,
      amount: payload.amount || 0,
      timestamp: event.timestamp.toISOString(),
    });
    if (payload.action === "FOLD") {
      participant.result = "FOLDED";
    }
  },
  STREET_ADVANCED: (ctx: AggregationContext, event: GameEvent) => {
    const payload = event.payload as StreetAdvancedPayload;
    if (payload.communityCards) {
      ctx.communityCards.push(...payload.communityCards);
    }
  },
  SHOWDOWN: (ctx: AggregationContext, event: GameEvent) => {
    const payload = event.payload as ShowdownPayload;
    payload.reveals.forEach((reveal) => {
      const userId = ctx.participantsBySeat.get(reveal.seatId);
      const participant = userId ? ctx.participants.get(userId) : undefined;
      if (participant) {
        participant.holeCards = reveal.cards;
      }
    });
  },
  POT_AWARDED: (ctx: AggregationContext, event: GameEvent) => {
    const payload = event.payload as PotAwardedPayload;
    ctx.pots.push({
      amount: payload.amount,
      winners: payload.winners
        .map((winner) => resolveUserId(winner.userId, winner.seatId, ctx.participantsBySeat))
        .filter((winnerId): winnerId is string => Boolean(winnerId)),
    });
    payload.winners.forEach((winner) => {
      const userId = resolveUserId(winner.userId, winner.seatId, ctx.participantsBySeat);
      if (!userId) {
        return;
      }
      ctx.winners.push({ userId, amount: winner.share });
      const participant = ctx.participants.get(userId);
      if (participant) {
        participant.result = "WON";
      }
    });
  },
  HAND_COMPLETED: (ctx: AggregationContext, event: GameEvent) => {
    const payload = event.payload as HandCompletedPayload;
    const endStacks =
      payload.playerEndStacks ||
      ((event.payload as { player_end_stacks?: Record<string, number> }).player_end_stacks ?? null);
    if (!endStacks) {
      return;
    }
    Object.entries(endStacks).forEach(([userId, stack]) => {
      const participant = ctx.participants.get(userId);
      if (participant) {
        participant.endingStack = stack;
      }
    });
  },
} satisfies Record<MaterializableEventType, MaterializerEventHandler>;

export class HandMaterializer {
  constructor(private readonly deps: HandMaterializerDependencies) {}

  private isRunning = false;
  private streamKey = 'events:all';
  private groupName = 'hand-materializer';
  private consumerName = `materializer-${process.pid}`;

  async start() {
    this.isRunning = true;

    try {
      await this.deps.redisClient.xGroupCreate(this.streamKey, this.groupName, '$', { MKSTREAM: true });
    } catch (err: unknown) {
      if ((err as Error).message.includes('BUSYGROUP')) {
        return;
      }
      console.error('Error creating consumer group:', err);
    }

    console.log(`HandMaterializer started, listening on ${this.streamKey}`);
    this.poll();
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const streams = await this.deps.redisClient.xReadGroup(
          this.groupName,
          this.consumerName,
          [{ key: this.streamKey, id: '>' }],
          { COUNT: 1, BLOCK: 5000 }
        );

        if (!streams) {
          continue;
        }
        for (const stream of streams) {
          for (const message of stream.messages) {
            const event = JSON.parse(message.message.data);
            await this.handleEvent(event);
            await this.deps.redisClient.xAck(this.streamKey, this.groupName, message.id);
          }
        }
      } catch (err) {
        console.error('Error polling events in HandMaterializer:', err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async handleEvent(event: Record<string, unknown>) {
    if (event.type !== 'HAND_COMPLETED') {
      return;
    }
    console.log(`Hand completed: ${event.handId}. Materializing record...`);
    await this.materializeHand(event.handId as string, event.tableId as string);
  }

  private async materializeHand(handId: string, tableId: string) {
    try {
      // 1. Query all events for this hand
      const { events } = await this.deps.eventStore.queryEvents({ handId, limit: 1000 });

      if (events.length === 0) return;

      // 2. Aggregate events into a HandRecord
      const record = this.aggregateEvents(handId, tableId, events);

      // 3. Save HandRecord
      await this.deps.handStore.saveHandRecord(record);
      this.deps.recordMaterializationLag(Date.now() - record.completedAt.getTime());
      console.log(`Hand record saved for hand ${handId}`);
    } catch (err) {
      console.error(`Failed to materialize hand ${handId}:`, err);
    }
  }

  private aggregateEvents(handId: string, tableId: string, events: GameEvent[]): HandRecord {
    const startedEvent = events.find((event) => event.type === "HAND_STARTED");
    const completedEvent = events.find((event) => event.type === "HAND_COMPLETED");

    const ctx: AggregationContext = {
      participants: new Map(),
      participantsBySeat: new Map(),
      communityCards: [],
      pots: [],
      winners: [],
    };

    events.forEach((event) => {
      const handler = materializerEventHandlers[event.type as MaterializableEventType];
      if (!handler) {
        return;
      }
      handler(ctx, event);
    });

    const config = adaptHandStartedConfig(startedEvent?.payload);

    return {
      handId,
      tableId,
      tableName: config.tableName,
      config: {
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        ante: config.ante,
      },
      participants: Array.from(ctx.participants.values()),
      communityCards: ctx.communityCards,
      pots: ctx.pots,
      winners: ctx.winners,
      startedAt: startedEvent?.timestamp || new Date(),
      completedAt: completedEvent?.timestamp || new Date(),
      duration:
        completedEvent && startedEvent
          ? completedEvent.timestamp.getTime() - startedEvent.timestamp.getTime()
          : 0,
    };
  }

  stop() {
    this.isRunning = false;
  }
}

export function createHandMaterializer(
  deps: HandMaterializerDependencies = {
    redisClient: blockingRedisClient,
    eventStore,
    handStore,
    recordMaterializationLag,
  }
) {
  return new HandMaterializer(deps);
}

export const handMaterializer = createHandMaterializer();

function getSeats(
  payload: HandStartedPayload,
  rawPayload: unknown
): HandStartedPayload["seats"] {
  return payload.seats || (rawPayload as { seats?: HandStartedPayload["seats"] }).seats || [];
}

function resolveUserId(
  userId: string | undefined,
  seatId: number,
  participantsBySeat: Map<number, string>
): string | undefined {
  return userId || participantsBySeat.get(seatId);
}

type HandStartedPayloadCompat = HandStartedPayload & {
  small_blind?: unknown;
  big_blind?: unknown;
  ante?: unknown;
  tableName?: unknown;
  table_name?: unknown;
};

function adaptHandStartedConfig(
  payload: unknown,
): { tableName: string; smallBlind: number; bigBlind: number; ante: number } {
  const compat = (payload ?? {}) as Partial<HandStartedPayloadCompat>;

  const numberValue = (value: unknown, fallback: number) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  };

  const stringValue = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

  const smallBlind = numberValue(compat.smallBlind ?? compat.small_blind, 0);
  const bigBlind = numberValue(compat.bigBlind ?? compat.big_blind, 0);
  const ante = numberValue(compat.ante, 0);
  const tableName = stringValue(compat.tableName ?? compat.table_name, "Unknown Table");

  return { tableName, smallBlind, bigBlind, ante };
}
