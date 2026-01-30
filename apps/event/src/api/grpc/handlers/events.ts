import type {
  GetEventRequest,
  ProtoGameEvent,
  ProtoPublishEventResponse,
  ProtoPublishEventsResponse,
  ProtoQueryEventsResponse,
  PublishEventRequest,
  PublishEventsRequest,
  QueryEventsRequest,
} from '../types';
import { unary } from '../unary';
import { NotFoundError } from '../../../errors';
import { eventValidationErrorToGrpc } from '../grpcErrors';
import type { EventServiceFacade } from '../../../services/facade';
import {
  coerceNonNegativeInt,
  coercePositiveInt,
  optionalNonEmptyString,
  optionalNumber,
  parseEventType,
  parseEventTypes,
  requireNonEmptyString,
  requireObject,
  timestampToDate,
} from './decoders';
import { mapEventToProto } from './mappers';

export type CreateEventHandlersOptions = {
  services: EventServiceFacade;
};

export function createEventHandlers({ services }: CreateEventHandlersOptions) {
  return {
    publishEvent: unary<PublishEventRequest, ProtoPublishEventResponse>(
      'PublishEvent',
      async (request) => {
        const type = parseEventType(request.type);
        const tableId = requireNonEmptyString(request.tableId, 'tableId');

        const result = await services.eventIngestion.ingestEvent({
          type,
          tableId,
          handId: optionalNonEmptyString(request.handId),
          userId: optionalNonEmptyString(request.userId),
          seatId: optionalNumber(request.seatId),
          payload: requireObject(request.payload, 'payload'),
          idempotencyKey: optionalNonEmptyString(request.idempotencyKey),
        });

        if (!result.ok) {
          throw eventValidationErrorToGrpc(result.error);
        }

        return { success: true, eventId: result.value.eventId };
      },
    ),

    publishEvents: unary<PublishEventsRequest, ProtoPublishEventsResponse>(
      'PublishEvents',
      async (request) => {
        const events = request.events.map((req) => ({
          type: parseEventType(req.type),
          tableId: requireNonEmptyString(req.tableId, 'tableId'),
          handId: optionalNonEmptyString(req.handId),
          userId: optionalNonEmptyString(req.userId),
          seatId: optionalNumber(req.seatId),
          payload: requireObject(req.payload, 'payload'),
          idempotencyKey: optionalNonEmptyString(req.idempotencyKey),
        }));

        const result = await services.eventIngestion.ingestEvents(events);
        if (!result.ok) {
          throw eventValidationErrorToGrpc(result.error);
        }
        return { success: true, eventIds: result.value.map((r) => r.eventId) };
      },
    ),

    queryEvents: unary<QueryEventsRequest, ProtoQueryEventsResponse>(
      'QueryEvents',
      async (request) => {
        const limit = coercePositiveInt(request.limit, 100);

        const result = await services.eventQuery.queryEvents({
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
      },
    ),

    getEvent: unary<GetEventRequest, ProtoGameEvent>('GetEvent', async (request) => {
      const eventId = requireNonEmptyString(request.eventId, 'eventId');
      const event = await services.eventQuery.getEvent(eventId);
      if (!event) {
        throw new NotFoundError('Event not found');
      }
      return mapEventToProto(event);
    }),
  };
}
