import type {
  GetCursorRequest,
  ProtoCursor,
  UpdateCursorRequest,
} from '../types';
import { unary } from '../unary';
import type { EventServiceFacade } from '../../../services/facade';
import { coerceNonNegativeInt, requireNonEmptyString } from './decoders';
import { mapCursorToProto } from './mappers';
import { createSubscribeToStreamHandler } from './streamingSubscription';

export type CreateStreamingHandlersOptions = {
  services: EventServiceFacade;
};

export function createStreamingHandlers({ services }: CreateStreamingHandlersOptions) {
  return {
    subscribeToStream: createSubscribeToStreamHandler({ streamService: services.stream }),

    getCursor: unary<GetCursorRequest, ProtoCursor>('GetCursor', async (request) => {
      const streamId = requireNonEmptyString(request.streamId, 'streamId');
      const subscriberId = requireNonEmptyString(request.subscriberId, 'subscriberId');

      const cursor = await services.stream.getCursor(streamId, subscriberId);
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

    updateCursor: unary<UpdateCursorRequest, ProtoCursor>('UpdateCursor', async (request) => {
      const streamId = requireNonEmptyString(request.streamId, 'streamId');
      const subscriberId = requireNonEmptyString(request.subscriberId, 'subscriberId');
      const position = coerceNonNegativeInt(request.position, 0);

      const cursor = await services.stream.updateCursor(streamId, subscriberId, position);
      return mapCursorToProto(cursor);
    }),
  };
}
