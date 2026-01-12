import * as grpc from "@grpc/grpc-js";
import {
  PublishEventRequest,
  PublishEventsRequest,
  QueryEventsRequest,
  GetEventRequest,
  GetHandRecordRequest,
  GetHandHistoryRequest,
  GetHandsForUserRequest,
  GetHandReplayRequest,
  SubscribeRequest,
  GetCursorRequest,
  UpdateCursorRequest,
} from "./types";
import { eventIngestionService } from "../../services/eventIngestionService";
import { eventQueryService } from "../../services/eventQueryService";
import { handRecordService } from "../../services/handRecordService";
import { replayService } from "../../services/replayService";
import { streamService } from "../../services/streamService";
import logger from "../../observability/logger";

export function createHandlers() {
  return {
    publishEvent: async (
      call: grpc.ServerUnaryCall<PublishEventRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const { type, tableId, handId, userId, seatId, payload, idempotencyKey } = call.request;
        const event = await eventIngestionService.ingestEvent({
          type,
          tableId,
          handId,
          userId,
          seatId,
          payload,
          idempotencyKey,
        });
        callback(null, { success: true, eventId: event.eventId });
      } catch (err: unknown) {
        callback({
          code: grpc.status.INTERNAL,
          message: (err as Error).message,
        });
      }
    },

    publishEvents: async (
      call: grpc.ServerUnaryCall<PublishEventsRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const events = call.request.events.map((req: PublishEventRequest) => ({
          type: req.type,
          tableId: req.tableId,
          handId: req.handId,
          userId: req.userId,
          seatId: req.seatId,
          payload: req.payload,
          idempotencyKey: req.idempotencyKey,
        }));
        const results = await eventIngestionService.ingestEvents(events);
        callback(null, { success: true, eventIds: results.map((r) => r.eventId) });
      } catch (err: unknown) {
        callback({
          code: grpc.status.INTERNAL,
          message: (err as Error).message,
        });
      }
    },

    queryEvents: async (
      call: grpc.ServerUnaryCall<QueryEventsRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const { tableId, handId, userId, types, startTime, endTime, limit, offset, cursor } = call.request;
        const result = await eventQueryService.queryEvents({
          tableId,
          handId,
          userId,
          types,
          startTime: startTime ? new Date(startTime.seconds * 1000) : undefined,
          endTime: endTime ? new Date(endTime.seconds * 1000) : undefined,
          limit: limit || 100,
          offset,
          cursor,
        });

        callback(null, {
          events: result.events.map((e) => ({
            eventId: e.eventId,
            type: e.type,
            tableId: e.tableId,
            handId: e.handId ?? undefined,
            userId: e.userId ?? undefined,
            seatId: e.seatId ?? undefined,
            payload: e.payload,
            timestamp: { seconds: Math.floor(e.timestamp.getTime() / 1000), nanos: 0 },
            sequence: e.sequence ?? 0,
          })),
          total: result.total,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        });
      } catch (err: unknown) {
        callback({
          code: grpc.status.INTERNAL,
          message: (err as Error).message,
        });
      }
    },

    getEvent: async (call: grpc.ServerUnaryCall<GetEventRequest, unknown>, callback: grpc.sendUnaryData<unknown>) => {
      try {
        const { eventId } = call.request;
        const event = await eventQueryService.getEvent(eventId);
        if (!event) {
          callback({ code: grpc.status.NOT_FOUND, message: "Event not found" });
          return;
        }
        callback(null, {
          eventId: event.eventId,
          type: event.type,
          tableId: event.tableId,
          handId: event.handId ?? undefined,
          userId: event.userId ?? undefined,
          seatId: event.seatId ?? undefined,
          payload: event.payload,
          timestamp: { seconds: Math.floor(event.timestamp.getTime() / 1000), nanos: 0 },
          sequence: event.sequence ?? 0,
        });
      } catch (err: unknown) {
        callback({ code: grpc.status.INTERNAL, message: (err as Error).message });
      }
    },

    getHandRecord: async (
      call: grpc.ServerUnaryCall<GetHandRecordRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const { handId, requesterId } = call.request;
        const record = await handRecordService.getHandRecord(handId, requesterId);
        if (!record) {
          callback({ code: grpc.status.NOT_FOUND, message: "Hand record not found" });
          return;
        }
        callback(null, mapHandRecordToProto(record));
      } catch (err: unknown) {
        callback({ code: grpc.status.INTERNAL, message: (err as Error).message });
      }
    },

    getHandHistory: async (
      call: grpc.ServerUnaryCall<GetHandHistoryRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const { tableId, limit, offset, requesterId } = call.request;
        const result = await handRecordService.getHandHistory(tableId, limit, offset, requesterId);
        callback(null, {
          hands: result.hands.map(mapHandRecordToProto),
          total: result.total,
        });
      } catch (err: unknown) {
        callback({ code: grpc.status.INTERNAL, message: (err as Error).message });
      }
    },

    getHandsForUser: async (
      call: grpc.ServerUnaryCall<GetHandsForUserRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const { userId, limit, offset } = call.request;
        const result = await handRecordService.getHandsForUser(userId, limit, offset);
        callback(null, {
          hands: result.hands.map(mapHandRecordToProto),
          total: result.total,
        });
      } catch (err: unknown) {
        const message = (err as Error).message;
        if (message.toLowerCase().includes("not authorized")) {
          callback({ code: grpc.status.PERMISSION_DENIED, message });
          return;
        }
        callback({ code: grpc.status.INTERNAL, message });
      }
    },

    getHandReplay: async (
      call: grpc.ServerUnaryCall<GetHandReplayRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const { handId, requesterId } = call.request;
        const events = await replayService.getHandEvents(handId, requesterId);
        callback(null, {
          handId,
          events: events.map((e) => ({
            eventId: e.eventId,
            type: e.type,
            tableId: e.tableId,
            handId: e.handId ?? undefined,
            userId: e.userId ?? undefined,
            seatId: e.seatId ?? undefined,
            payload: e.payload,
            timestamp: { seconds: Math.floor(e.timestamp.getTime() / 1000), nanos: 0 },
            sequence: e.sequence ?? 0,
          })),
        });
      } catch (err: unknown) {
        callback({ code: grpc.status.INTERNAL, message: (err as Error).message });
      }
    },

    subscribeToStream: async (call: grpc.ServerWritableStream<SubscribeRequest, unknown>) => {
      const { streamId, startSequence } = call.request;
      let lastId = startSequence ? "0-0" : "$";
      let lastSequence = startSequence || 0;

      logger.info({ streamId, startSequence }, "Subscription started");

      const poll = async () => {
        while (!call.cancelled) {
          try {
            const streams = await streamService.readStream(streamId, lastId);

            if (streams) {
              for (const stream of streams) {
                for (const message of stream.messages) {
                  const event = JSON.parse(message.message.data) as {
                    eventId: string;
                    type: string;
                    tableId: string;
                    handId?: string | null;
                    userId?: string | null;
                    seatId?: number | null;
                    payload: Record<string, unknown>;
                    timestamp: string;
                    sequence?: number | null;
                  };
                  if (event.sequence && event.sequence <= lastSequence) {
                    lastId = message.id;
                    continue;
                  }
                  call.write({
                    eventId: event.eventId,
                    type: event.type,
                    tableId: event.tableId,
                    handId: event.handId ?? undefined,
                    userId: event.userId ?? undefined,
                    seatId: event.seatId ?? undefined,
                    payload: event.payload,
                    timestamp: { seconds: Math.floor(new Date(event.timestamp).getTime() / 1000), nanos: 0 },
                    sequence: event.sequence ?? 0,
                  });
                  lastId = message.id;
                  lastSequence = event.sequence ?? lastSequence;
                }
              }
            }
          } catch (err) {
            logger.error({ err, streamId }, "Error reading from Redis stream");
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        logger.info({ streamId }, "Subscription ended");
      };

      poll();
    },

    getCursor: async (call: grpc.ServerUnaryCall<GetCursorRequest, unknown>, callback: grpc.sendUnaryData<unknown>) => {
      try {
        const { streamId, subscriberId } = call.request;
        const cursor = await streamService.getCursor(streamId, subscriberId);
        if (!cursor) {
          callback(null, {
            cursorId: `${streamId}:${subscriberId}`,
            streamId,
            subscriberId,
            position: 0,
            createdAt: { seconds: 0, nanos: 0 },
            updatedAt: { seconds: 0, nanos: 0 },
          });
          return;
        }
        callback(null, {
          cursorId: cursor.cursorId,
          streamId: cursor.streamId,
          subscriberId: cursor.subscriberId,
          position: cursor.position,
          createdAt: { seconds: Math.floor(cursor.createdAt.getTime() / 1000), nanos: 0 },
          updatedAt: { seconds: Math.floor(cursor.updatedAt.getTime() / 1000), nanos: 0 },
        });
      } catch (err: unknown) {
        callback({ code: grpc.status.INTERNAL, message: (err as Error).message });
      }
    },

    updateCursor: async (
      call: grpc.ServerUnaryCall<UpdateCursorRequest, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const { streamId, subscriberId, position } = call.request;
        const cursor = await streamService.updateCursor(streamId, subscriberId, position);
        callback(null, {
          cursorId: cursor.cursorId,
          streamId: cursor.streamId,
          subscriberId: cursor.subscriberId,
          position: cursor.position,
          createdAt: { seconds: Math.floor(cursor.createdAt.getTime() / 1000), nanos: 0 },
          updatedAt: { seconds: Math.floor(cursor.updatedAt.getTime() / 1000), nanos: 0 },
        });
      } catch (err: unknown) {
        callback({ code: grpc.status.INTERNAL, message: (err as Error).message });
      }
    },
  };
}

function mapHandRecordToProto(r: {
  handId: string;
  tableId: string;
  tableName: string;
  config: { smallBlind: number; bigBlind: number; ante: number };
  participants: {
    seatId: number;
    userId: string;
    nickname: string;
    startingStack: number;
    endingStack: number;
    holeCards: { rank: string; suit: string }[] | null;
    actions: { street: string; action: string; amount: number; timestamp: string }[];
    result: string;
  }[];
  communityCards: { rank: string; suit: string }[];
  pots: { amount: number; winners: string[] }[];
  winners: { userId: string; amount: number }[];
  startedAt: Date;
  completedAt: Date;
  duration: number;
}) {
  return {
    handId: r.handId,
    tableId: r.tableId,
    tableName: r.tableName,
    config: r.config,
    participants: r.participants.map((p) => ({
      seatId: p.seatId,
      userId: p.userId,
      nickname: p.nickname,
      startingStack: p.startingStack,
      endingStack: p.endingStack,
      holeCards: p.holeCards ?? [],
      actions: p.actions.map((a) => ({
        street: a.street,
        action: a.action,
        amount: a.amount,
        timestamp: { seconds: Math.floor(new Date(a.timestamp).getTime() / 1000), nanos: 0 },
      })),
      result: p.result,
    })),
    communityCards: r.communityCards,
    pots: r.pots.map((p) => ({
      amount: p.amount,
      winners: p.winners,
    })),
    winners: r.winners.map((w) => ({
      userId: w.userId,
      amount: w.amount,
    })),
    startedAt: { seconds: Math.floor(new Date(r.startedAt).getTime() / 1000), nanos: 0 },
    completedAt: { seconds: Math.floor(new Date(r.completedAt).getTime() / 1000), nanos: 0 },
    durationMs: r.duration,
  };
}
