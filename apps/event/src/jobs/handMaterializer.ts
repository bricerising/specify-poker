import redisClient from '../storage/redisClient';
import { eventStore } from '../storage/eventStore';
import { handStore } from '../storage/handStore';
import { HandRecord, Participant } from '../domain/types';

export class HandMaterializer {
  private isRunning = false;
  private streamKey = 'events:all';
  private groupName = 'hand-materializer';
  private consumerName = `materializer-${process.pid}`;

  async start() {
    this.isRunning = true;

    try {
      await redisClient.xGroupCreate(this.streamKey, this.groupName, '$', { MKSTREAM: true });
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
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

  private async handleEvent(event: any) {
    if (event.type === 'HAND_COMPLETED') {
      console.log(`Hand completed: ${event.hand_id}. Materializing record...`);
      await this.materializeHand(event.hand_id, event.table_id);
    }
  }

  private async materializeHand(handId: string, tableId: string) {
    try {
      // 1. Query all events for this hand
      const { events } = await eventStore.queryEvents({ hand_id: handId, limit: 1000 });

      if (events.length === 0) return;

      // 2. Aggregate events into a HandRecord
      const record = this.aggregateEvents(handId, tableId, events);

      // 3. Save HandRecord
      await handStore.saveHandRecord(record);
      console.log(`Hand record saved for hand ${handId}`);
    } catch (err) {
      console.error(`Failed to materialize hand ${handId}:`, err);
    }
  }

  private aggregateEvents(handId: string, tableId: string, events: any[]): HandRecord {
    // Basic aggregation logic based on data-model.md
    const startedEvent = events.find(e => e.type === 'HAND_STARTED');
    const completedEvent = events.find(e => e.type === 'HAND_COMPLETED');

    const participants: Record<string, Participant> = {};
    const communityCards: string[] = [];
    const pots: { amount: number; winners: string[] }[] = [];
    const winners: { user_id: string; amount: number }[] = [];

    events.forEach(e => {
      // Initialize participants
      if (e.type === 'HAND_STARTED') {
        const seats = e.payload.seats || [];
        seats.forEach((seat: any) => {
          participants[seat.userId] = {
            seat_id: seat.seatId,
            user_id: seat.userId,
            nickname: seat.nickname || `Player ${seat.seatId}`,
            starting_stack: seat.stack,
            ending_stack: seat.stack,
            hole_cards: [],
            actions: [],
            result: 'LOST'
          };
        });
      }

      if (e.type === 'CARDS_DEALT' && e.user_id) {
        if (participants[e.user_id]) {
          participants[e.user_id].hole_cards = e.payload.cards;
        }
      }

      if (e.type === 'ACTION_TAKEN' && e.user_id) {
        if (participants[e.user_id]) {
          participants[e.user_id].actions.push({
            street: e.payload.street || 'unknown',
            action: e.payload.action,
            amount: e.payload.amount || 0,
            timestamp: e.timestamp
          });
          if (e.payload.action === 'FOLD') {
            participants[e.user_id].result = 'FOLDED';
          }
        }
      }

      if (e.type === 'STREET_ADVANCED') {
        if (e.payload.communityCards) {
          communityCards.push(...e.payload.communityCards);
        }
      }

      if (e.type === 'POT_AWARDED') {
         pots.push({
           amount: e.payload.amount,
           winners: e.payload.winners.map((w: any) => w.userId || w.user_id)
         });
         e.payload.winners.forEach((w: any) => {
           const userId = w.userId || w.user_id;
           winners.push({ user_id: userId, amount: w.amount || w.share });
           if (participants[userId]) {
             participants[userId].result = 'WON';
           }
         });
      }

      if (e.type === 'HAND_COMPLETED') {
        if (e.payload.player_end_stacks) {
          Object.entries(e.payload.player_end_stacks).forEach(([userId, stack]: [string, any]) => {
            if (participants[userId]) {
              participants[userId].ending_stack = stack;
            }
          });
        }
      }
    });

    return {
      hand_id: handId,
      table_id: tableId,
      table_name: startedEvent?.payload?.table_name || 'Unknown Table',
      config: startedEvent?.payload?.config || {},
      participants: Object.values(participants),
      community_cards: communityCards,
      pots,
      winners,
      started_at: startedEvent?.timestamp || new Date(),
      completed_at: completedEvent?.timestamp || new Date(),
      duration_ms: completedEvent && startedEvent ?
        new Date(completedEvent.timestamp).getTime() - new Date(startedEvent.timestamp).getTime() : 0
    };
  }

  stop() {
    this.isRunning = false;
  }
}

export const handMaterializer = new HandMaterializer();
