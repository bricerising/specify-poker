import * as grpc from '@grpc/grpc-js';
import { eventIngestionService } from '../../services/eventIngestionService';
import { eventQueryService } from '../../services/eventQueryService';
import { handRecordService } from '../../services/handRecordService';
import { replayService } from '../../services/replayService';
import redisClient from '../../storage/redisClient';

export function createHandlers() {
  return {
    publishEvent: async (call: any, callback: any) => {
      try {
        const { type, tableId, handId, userId, seatId, payload } = call.request;
        const event = await eventIngestionService.ingestEvent({
          type,
          table_id: tableId,
          hand_id: handId,
          user_id: userId,
          seat_id: seatId,
          payload
        });
        callback(null, { success: true, eventId: event.event_id });
      } catch (err: any) {
        callback({
          code: grpc.status.INTERNAL,
          message: err.message
        });
      }
    },

    publishEvents: async (call: any, callback: any) => {
      try {
        const events = call.request.events.map((req: any) => ({
          type: req.type,
          table_id: req.tableId,
          hand_id: req.handId,
          user_id: req.userId,
          seat_id: req.seatId,
          payload: req.payload
        }));
        const results = await eventIngestionService.ingestEvents(events);
        callback(null, { success: true, eventIds: results.map(r => r.event_id) });
      } catch (err: any) {
        callback({
          code: grpc.status.INTERNAL,
          message: err.message
        });
      }
    },

    queryEvents: async (call: any, callback: any) => {
      try {
        const { tableId, handId, userId, types, startTime, endTime, limit, offset } = call.request;
        const result = await eventQueryService.queryEvents({
          table_id: tableId,
          hand_id: handId,
          user_id: userId,
          types,
          start_time: startTime ? new Date(startTime.seconds * 1000) : undefined,
          end_time: endTime ? new Date(endTime.seconds * 1000) : undefined,
          limit,
          offset
        });

        callback(null, {
          events: result.events.map(e => ({
            eventId: e.event_id,
            type: e.type,
            tableId: e.table_id,
            handId: e.hand_id,
            userId: e.user_id,
            seatId: e.seat_id,
            payload: e.payload,
            timestamp: { seconds: Math.floor(e.timestamp.getTime() / 1000), nanos: 0 },
            sequence: e.sequence
          })),
          total: result.total,
          hasMore: result.total > (offset || 0) + result.events.length
        });
      } catch (err: any) {
        callback({
          code: grpc.status.INTERNAL,
          message: err.message
        });
      }
    },

    getEvent: async (call: any, callback: any) => {
      try {
        const event = await eventQueryService.getEvent(call.request.eventId);
        if (!event) {
          callback({ code: grpc.status.NOT_FOUND, message: 'Event not found' });
          return;
        }
        callback(null, {
          eventId: event.event_id,
          type: event.type,
          tableId: event.table_id,
          handId: event.hand_id,
          userId: event.user_id,
          seatId: event.seat_id,
          payload: event.payload,
          timestamp: { seconds: Math.floor(event.timestamp.getTime() / 1000), nanos: 0 },
          sequence: event.sequence
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    getHandRecord: async (call: any, callback: any) => {
      try {
        const { handId, requesterId } = call.request;
        const record = await handRecordService.getHandRecord(handId, requesterId);
        if (!record) {
          callback({ code: grpc.status.NOT_FOUND, message: 'Hand record not found' });
          return;
        }
        callback(null, mapHandRecordToProto(record));
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    getHandHistory: async (call: any, callback: any) => {
      try {
        const { tableId, limit, offset, requesterId } = call.request;
        const result = await handRecordService.getHandHistory(tableId, limit, offset);
        callback(null, {
          hands: result.hands.map(mapHandRecordToProto),
          total: result.total
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    getHandsForUser: async (call: any, callback: any) => {
      try {
        const { userId, limit, offset } = call.request;
        const result = await handRecordService.getHandsForUser(userId, limit, offset);
        callback(null, {
          hands: result.hands.map(mapHandRecordToProto),
          total: result.total
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    getHandReplay: async (call: any, callback: any) => {
       try {
        const { handId } = call.request;
        const events = await replayService.getHandEvents(handId);
        callback(null, {
          handId,
          events: events.map(e => ({
            eventId: e.event_id,
            type: e.type,
            tableId: e.table_id,
            handId: e.hand_id,
            userId: e.user_id,
            seatId: e.seat_id,
            payload: e.payload,
            timestamp: { seconds: Math.floor(e.timestamp.getTime() / 1000), nanos: 0 },
            sequence: e.sequence
          }))
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    subscribeToStream: async (call: any) => {
      const { streamId, startSequence } = call.request;
      const redisStreamKey = streamId === 'all' ? 'events:all' : `events:table:${streamId}`;
      let lastId = startSequence ? `${startSequence}-0` : '$';

      console.log(`Subscription started for stream ${redisStreamKey} starting at ${lastId}`);

      const poll = async () => {
        while (!call.cancelled) {
          try {
            const streams = await redisClient.xRead(
              [{ key: redisStreamKey, id: lastId }],
              { COUNT: 10, BLOCK: 5000 }
            );

            if (streams) {
              for (const stream of streams) {
                for (const message of stream.messages) {
                  const event = JSON.parse(message.message.data);
                  call.write({
                    eventId: event.event_id,
                    type: event.type,
                    tableId: event.table_id,
                    handId: event.hand_id,
                    userId: event.user_id,
                    seatId: event.seat_id,
                    payload: event.payload,
                    timestamp: { seconds: Math.floor(new Date(event.timestamp).getTime() / 1000), nanos: 0 },
                    sequence: event.sequence
                  });
                  lastId = message.id;
                }
              }
            }
          } catch (err) {
            console.error('Error reading from Redis stream:', err);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        console.log(`Subscription ended for stream ${redisStreamKey}`);
      };

      poll();
    },

    getCursor: async (call: any, callback: any) => {
      try {
        const { streamId, subscriberId } = call.request;
        const key = `cursor:${streamId}:${subscriberId}`;
        const position = await redisClient.get(key);
        callback(null, {
          streamId,
          subscriberId,
          position: position ? parseInt(position) : 0
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    updateCursor: async (call: any, callback: any) => {
      try {
        const { streamId, subscriberId, position } = call.request;
        const key = `cursor:${streamId}:${subscriberId}`;
        await redisClient.set(key, position.toString());
        callback(null, {
          streamId,
          subscriberId,
          position
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    }
  };
}

function mapHandRecordToProto(r: any) {
  return {
    handId: r.hand_id,
    tableId: r.table_id,
    tableName: r.table_name,
    config: r.config,
    participants: r.participants.map((p: any) => ({
      seatId: p.seat_id,
      userId: p.user_id,
      nickname: p.nickname,
      startingStack: p.starting_stack,
      endingStack: p.ending_stack,
      holeCards: p.hole_cards,
      actions: p.actions.map((a: any) => ({
        street: a.street,
        action: a.action,
        amount: a.amount,
        timestamp: { seconds: Math.floor(new Date(a.timestamp).getTime() / 1000), nanos: 0 }
      })),
      result: p.result
    })),
    communityCards: r.community_cards,
    pots: r.pots.map((p: any) => ({
      amount: p.amount,
      winners: p.winners
    })),
    winners: r.winners.map((w: any) => ({
      userId: w.user_id,
      amount: w.amount
    })),
    startedAt: { seconds: Math.floor(new Date(r.started_at).getTime() / 1000), nanos: 0 },
    completedAt: { seconds: Math.floor(new Date(r.completed_at).getTime() / 1000), nanos: 0 },
    durationMs: r.duration_ms
  };
}
