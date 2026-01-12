import redisClient from "../storage/redisClient";
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

export class HandMaterializer {
  private isRunning = false;
  private streamKey = 'events:all';
  private groupName = 'hand-materializer';
  private consumerName = `materializer-${process.pid}`;

  async start() {
    this.isRunning = true;

    try {
      await redisClient.xGroupCreate(this.streamKey, this.groupName, '$', { MKSTREAM: true });
    } catch (err: unknown) {
      if (!(err as Error).message.includes('BUSYGROUP')) {
        console.error('Error creating consumer group:', err);
      }
    }

    console.log(`HandMaterializer started, listening on ${this.streamKey}`);
    this.poll();
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const streams = await redisClient.xReadGroup(
          this.groupName,
          this.consumerName,
          [{ key: this.streamKey, id: '>' }],
          { COUNT: 1, BLOCK: 5000 }
        );

        if (streams) {
          for (const stream of streams) {
            for (const message of stream.messages) {
              const event = JSON.parse(message.message.data);
              await this.handleEvent(event);
              await redisClient.xAck(this.streamKey, this.groupName, message.id);
            }
          }
        }
      } catch (err) {
        console.error('Error polling events in HandMaterializer:', err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async handleEvent(event: Record<string, unknown>) {
    if (event.type === 'HAND_COMPLETED') {
      console.log(`Hand completed: ${event.handId}. Materializing record...`);
      await this.materializeHand(event.handId as string, event.tableId as string);
    }
  }

  private async materializeHand(handId: string, tableId: string) {
    try {
      // 1. Query all events for this hand
      const { events } = await eventStore.queryEvents({ handId, limit: 1000 });

      if (events.length === 0) return;

      // 2. Aggregate events into a HandRecord
      const record = this.aggregateEvents(handId, tableId, events);

      // 3. Save HandRecord
      await handStore.saveHandRecord(record);
      recordMaterializationLag(Date.now() - record.completedAt.getTime());
      console.log(`Hand record saved for hand ${handId}`);
    } catch (err) {
      console.error(`Failed to materialize hand ${handId}:`, err);
    }
  }

  private aggregateEvents(handId: string, tableId: string, events: GameEvent[]): HandRecord {
    const startedEvent = events.find((event) => event.type === "HAND_STARTED");
    const completedEvent = events.find((event) => event.type === "HAND_COMPLETED");

    const participants = new Map<
      string,
      {
        seatId: number;
        userId: string;
        nickname: string;
        startingStack: number;
        endingStack: number;
        holeCards: Card[] | null;
        actions: { street: string; action: string; amount: number; timestamp: string }[];
        result: "WON" | "LOST" | "FOLDED" | "SPLIT";
      }
    >();
    const communityCards: Card[] = [];
    const pots: { amount: number; winners: string[] }[] = [];
    const winners: { userId: string; amount: number }[] = [];

    events.forEach((event) => {
      if (event.type === "HAND_STARTED") {
        const payload = event.payload as HandStartedPayload;
        const seats = payload.seats || (event.payload as { seats?: HandStartedPayload["seats"] }).seats || [];
        seats.forEach((seat) => {
          participants.set(seat.userId, {
            seatId: seat.seatId,
            userId: seat.userId,
            nickname: seat.nickname || `Player ${seat.seatId}`,
            startingStack: seat.stack,
            endingStack: seat.stack,
            holeCards: null,
            actions: [],
            result: "LOST",
          });
        });
      }

      if (event.type === "CARDS_DEALT" && event.userId) {
        const payload = event.payload as { cards?: Card[] };
        const participant = participants.get(event.userId);
        if (participant) {
          participant.holeCards = payload.cards || null;
        }
      }

      if (event.type === "ACTION_TAKEN" && event.userId) {
        const payload = event.payload as ActionTakenPayload;
        const participant = participants.get(event.userId);
        if (participant) {
          participant.actions.push({
            street: payload.street || "unknown",
            action: payload.action,
            amount: payload.amount || 0,
            timestamp: event.timestamp.toISOString(),
          });
          if (payload.action === "FOLD") {
            participant.result = "FOLDED";
          }
        }
      }

      if (event.type === "STREET_ADVANCED") {
        const payload = event.payload as StreetAdvancedPayload;
        if (payload.communityCards) {
          communityCards.push(...payload.communityCards);
        }
      }

      if (event.type === "SHOWDOWN") {
        const payload = event.payload as ShowdownPayload;
        payload.reveals.forEach((reveal) => {
          const participant = Array.from(participants.values()).find((p) => p.seatId === reveal.seatId);
          if (participant) {
            participant.holeCards = reveal.cards;
          }
        });
      }

      if (event.type === "POT_AWARDED") {
        const payload = event.payload as PotAwardedPayload;
        pots.push({
          amount: payload.amount,
          winners: payload.winners
            .map((winner) => {
              if (winner.userId) {
                return winner.userId;
              }
              const bySeat = Array.from(participants.values()).find((p) => p.seatId === winner.seatId);
              return bySeat ? bySeat.userId : "";
            })
            .filter((winnerId) => winnerId.length > 0),
        });
        payload.winners.forEach((winner) => {
          const userId =
            winner.userId || Array.from(participants.values()).find((p) => p.seatId === winner.seatId)?.userId;
          if (!userId) {
            return;
          }
          winners.push({ userId, amount: winner.share });
          const participant = participants.get(userId);
          if (participant) {
            participant.result = "WON";
          }
        });
      }

      if (event.type === "HAND_COMPLETED") {
        const payload = event.payload as HandCompletedPayload;
        const endStacks =
          payload.playerEndStacks ||
          ((event.payload as { player_end_stacks?: Record<string, number> }).player_end_stacks ?? null);
        if (endStacks) {
          Object.entries(endStacks).forEach(([userId, stack]) => {
            const participant = participants.get(userId);
            if (participant) {
              participant.endingStack = stack;
            }
          });
        }
      }
    });

    const configPayload = (startedEvent?.payload as HandStartedPayload | undefined) || {
      smallBlind: 0,
      bigBlind: 0,
      seats: [],
    };
    const smallBlind =
      configPayload.smallBlind || (startedEvent?.payload as { small_blind?: number } | undefined)?.small_blind || 0;
    const bigBlind =
      configPayload.bigBlind || (startedEvent?.payload as { big_blind?: number } | undefined)?.big_blind || 0;
    const tableName =
      (startedEvent?.payload as { tableName?: string } | undefined)?.tableName ||
      (startedEvent?.payload as { table_name?: string } | undefined)?.table_name ||
      "Unknown Table";

    return {
      handId,
      tableId,
      tableName,
      config: {
        smallBlind,
        bigBlind,
        ante: (startedEvent?.payload as { ante?: number } | undefined)?.ante ?? 0,
      },
      participants: Array.from(participants.values()),
      communityCards,
      pots,
      winners,
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

export const handMaterializer = new HandMaterializer();
