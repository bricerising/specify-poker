import * as grpc from '@grpc/grpc-js';
import type {
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
} from './types';
import { unary } from './unary';
import { eventIngestionService } from '../../services/eventIngestionService';
import { eventQueryService } from '../../services/eventQueryService';
import { handRecordService } from '../../services/handRecordService';
import { replayService } from '../../services/replayService';
import { streamService } from '../../services/streamService';
import type { EventType } from '../../domain/types';
import { isEventType } from '../../domain/types';
import logger from '../../observability/logger';
import { InvalidArgumentError, isRecord, NotFoundError } from '../../errors';

export function createHandlers() {
  return {
    publishEvent: unary<PublishEventRequest, unknown>(async (request) => {
      const type = parseEventType(request.type);
      const tableId = requireNonEmptyString(request.tableId, 'tableId');

      const event = await eventIngestionService.ingestEvent({
        type,
        tableId,
        handId: optionalNonEmptyString(request.handId),
        userId: optionalNonEmptyString(request.userId),
        seatId: optionalNumber(request.seatId),
        payload: requireObject(request.payload, 'payload') as Record<string, unknown>,
        idempotencyKey: optionalNonEmptyString(request.idempotencyKey),
      });

      return { success: true, eventId: event.eventId };
    }),

    publishEvents: unary<PublishEventsRequest, unknown>(async (request) => {
      const events = request.events.map((req) => ({
        type: parseEventType(req.type),
        tableId: requireNonEmptyString(req.tableId, 'tableId'),
        handId: optionalNonEmptyString(req.handId),
        userId: optionalNonEmptyString(req.userId),
        seatId: optionalNumber(req.seatId),
        payload: requireObject(req.payload, 'payload') as Record<string, unknown>,
        idempotencyKey: optionalNonEmptyString(req.idempotencyKey),
      }));

      const results = await eventIngestionService.ingestEvents(events);
      return { success: true, eventIds: results.map((r) => r.eventId) };
    }),

    queryEvents: unary<QueryEventsRequest, unknown>(async (request) => {
      const limit = coercePositiveInt(request.limit, 100);

      const result = await eventQueryService.queryEvents({
        tableId: optionalNonEmptyString(request.tableId),
        handId: optionalNonEmptyString(request.handId),
        userId: optionalNonEmptyString(request.userId),
        types: parseEventTypes(request.types),
        startTime: timestampToDate(request.startTime),
        endTime: timestampToDate(request.endTime),
        limit,
        offset: coerceNonNegativeInt(request.offset, 0),
        cursor: optionalNonEmptyString(request.cursor),
      });

      return {
        events: result.events.map(mapEventToProto),
        total: result.total,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      };
    }),

    getEvent: unary<GetEventRequest, unknown>(async (request) => {
      const eventId = requireNonEmptyString(request.eventId, 'eventId');
      const event = await eventQueryService.getEvent(eventId);
      if (!event) {
        throw new NotFoundError('Event not found');
      }
      return mapEventToProto(event);
    }),

    getHandRecord: unary<GetHandRecordRequest, unknown>(async (request) => {
      const handId = requireNonEmptyString(request.handId, 'handId');
      const record = await handRecordService.getHandRecord(
        handId,
        optionalNonEmptyString(request.requesterId),
      );
      if (!record) {
        throw new NotFoundError('Hand record not found');
      }
      return mapHandRecordToProto(record);
    }),

    getHandHistory: unary<GetHandHistoryRequest, unknown>(async (request) => {
      const tableId = requireNonEmptyString(request.tableId, 'tableId');
      const limit = coercePositiveInt(request.limit, 20);
      const offset = coerceNonNegativeInt(request.offset, 0);
      const result = await handRecordService.getHandHistory(
        tableId,
        limit,
        offset,
        optionalNonEmptyString(request.requesterId),
      );
      return {
        hands: result.hands.map(mapHandRecordToProto),
        total: result.total,
      };
    }),

    getHandsForUser: unary<GetHandsForUserRequest, unknown>(async (request) => {
      const userId = requireNonEmptyString(request.userId, 'userId');
      const limit = coercePositiveInt(request.limit, 20);
      const offset = coerceNonNegativeInt(request.offset, 0);
      const result = await handRecordService.getHandsForUser(userId, limit, offset);
      return {
        hands: result.hands.map(mapHandRecordToProto),
        total: result.total,
      };
    }),

    getHandReplay: unary<GetHandReplayRequest, unknown>(async (request) => {
      const handId = requireNonEmptyString(request.handId, 'handId');
      const events = await replayService.getHandEvents(
        handId,
        optionalNonEmptyString(request.requesterId),
      );
      return { handId, events: events.map(mapEventToProto) };
    }),

    subscribeToStream: async (call: grpc.ServerWritableStream<SubscribeRequest, unknown>) => {
      const { streamId, startSequence } = call.request;
      if (!streamId || streamId.trim().length === 0) {
        call.emit('error', { code: grpc.status.INVALID_ARGUMENT, message: 'streamId is required' });
        return;
      }

      const hasStartSequence = typeof startSequence === 'number' && startSequence > 0;
      let lastId = hasStartSequence ? '0-0' : '$';
      let lastSequence = hasStartSequence ? startSequence : 0;

      logger.info({ streamId, startSequence }, 'Subscription started');

      const poll = async () => {
        while (!call.cancelled) {
          try {
            const streams = await streamService.readStream(streamId, lastId);

            if (streams) {
              for (const stream of streams) {
                for (const message of stream.messages) {
                  lastId = message.id;

                  const parsed = safeJsonParse(message.message.data);
                  if (!parsed) {
                    logger.error(
                      { streamId, messageId: message.id },
                      'Invalid JSON in Redis stream message',
                    );
                    continue;
                  }

                  const event = parsed;
                  const timestampValue = new Date(event.timestamp);
                  if (Number.isNaN(timestampValue.getTime())) {
                    logger.error(
                      { streamId, messageId: message.id, timestamp: event.timestamp },
                      'Invalid timestamp in Redis stream message',
                    );
                    continue;
                  }

                  const sequence = event.sequence;
                  if (sequence !== null && sequence <= lastSequence) {
                    lastId = message.id;
                    continue;
                  }

                  call.write(
                    mapEventToProto({
                      eventId: event.eventId,
                      type: event.type,
                      tableId: event.tableId,
                      handId: event.handId,
                      userId: event.userId,
                      seatId: event.seatId,
                      payload: event.payload,
                      timestamp: timestampValue,
                      sequence,
                    }),
                  );
                  lastSequence = sequence ?? lastSequence;
                }
              }
            }
          } catch (err) {
            logger.error({ error: err, streamId }, 'Error reading from Redis stream');
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        logger.info({ streamId }, 'Subscription ended');
      };

      void poll();
    },

    getCursor: unary<GetCursorRequest, unknown>(async (request) => {
      const streamId = requireNonEmptyString(request.streamId, 'streamId');
      const subscriberId = requireNonEmptyString(request.subscriberId, 'subscriberId');

      const cursor = await streamService.getCursor(streamId, subscriberId);
      return cursor
        ? mapCursorToProto(cursor)
        : mapCursorToProto({
            cursorId: `${streamId}:${subscriberId}`,
            streamId,
            subscriberId,
            position: 0,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          });
    }),

    updateCursor: unary<UpdateCursorRequest, unknown>(async (request) => {
      const streamId = requireNonEmptyString(request.streamId, 'streamId');
      const subscriberId = requireNonEmptyString(request.subscriberId, 'subscriberId');
      const position = coerceNonNegativeInt(request.position, 0);

      const cursor = await streamService.updateCursor(streamId, subscriberId, position);
      return mapCursorToProto(cursor);
    }),
  };
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidArgumentError(`${fieldName} is required`);
  }
  return value;
}

function optionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return value;
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidArgumentError(`${fieldName} must be an object`);
  }
  return value;
}

function coercePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function coerceNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function parseEventType(value: unknown): EventType {
  if (!isEventType(value)) {
    throw new InvalidArgumentError(`Unknown event type: ${String(value)}`);
  }
  return value;
}

function parseEventTypes(values: unknown): EventType[] | undefined {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }
  return values.map(parseEventType);
}

type GrpcTimestamp = { seconds: number; nanos?: number };

function timestampToDate(timestamp?: GrpcTimestamp): Date | undefined {
  if (!timestamp) {
    return undefined;
  }
  if (typeof timestamp.seconds !== 'number' || !Number.isFinite(timestamp.seconds)) {
    throw new InvalidArgumentError('timestamp.seconds must be a number');
  }
  const nanos =
    typeof timestamp.nanos === 'number' && Number.isFinite(timestamp.nanos) ? timestamp.nanos : 0;
  return new Date(timestamp.seconds * 1000 + Math.floor(nanos / 1_000_000));
}

function toTimestamp(date: Date): { seconds: number; nanos: 0 } {
  return { seconds: Math.floor(date.getTime() / 1000), nanos: 0 };
}

type StreamEventJson = {
  eventId: string;
  type: string;
  tableId: string;
  handId: string | null;
  userId: string | null;
  seatId: number | null;
  payload: Record<string, unknown>;
  timestamp: string;
  sequence: number | null;
};

function safeJsonParse(raw: string): StreamEventJson | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    const { eventId, type, tableId, handId, userId, seatId, payload, timestamp, sequence } = parsed;
    if (
      typeof eventId !== 'string' ||
      typeof type !== 'string' ||
      typeof tableId !== 'string' ||
      !isRecord(payload)
    ) {
      return null;
    }
    if (typeof timestamp !== 'string') {
      return null;
    }

    return {
      eventId,
      type,
      tableId,
      handId: typeof handId === 'string' ? handId : null,
      userId: typeof userId === 'string' ? userId : null,
      seatId: typeof seatId === 'number' && Number.isFinite(seatId) ? seatId : null,
      payload,
      timestamp,
      sequence: typeof sequence === 'number' && Number.isFinite(sequence) ? sequence : null,
    };
  } catch {
    return null;
  }
}

function mapEventToProto(event: {
  eventId: string;
  type: string;
  tableId: string;
  handId?: string | null;
  userId?: string | null;
  seatId?: number | null;
  payload: unknown;
  timestamp: Date;
  sequence?: number | null;
}) {
  return {
    eventId: event.eventId,
    type: event.type,
    tableId: event.tableId,
    handId: event.handId ?? undefined,
    userId: event.userId ?? undefined,
    seatId: event.seatId ?? undefined,
    payload: event.payload,
    timestamp: toTimestamp(event.timestamp),
    sequence: event.sequence ?? 0,
  };
}

function mapCursorToProto(cursor: {
  cursorId: string;
  streamId: string;
  subscriberId: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    cursorId: cursor.cursorId,
    streamId: cursor.streamId,
    subscriberId: cursor.subscriberId,
    position: cursor.position,
    createdAt: toTimestamp(cursor.createdAt),
    updatedAt: toTimestamp(cursor.updatedAt),
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
        timestamp: toTimestamp(new Date(a.timestamp)),
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
    startedAt: toTimestamp(new Date(r.startedAt)),
    completedAt: toTimestamp(new Date(r.completedAt)),
    durationMs: r.duration,
  };
}
