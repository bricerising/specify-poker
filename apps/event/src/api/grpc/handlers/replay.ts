import type { GetHandReplayRequest, ProtoGetHandReplayResponse } from '../types';
import { unary } from '../unary';
import type { EventServiceFacade } from '../../../services/facade';
import { optionalNonEmptyString, requireNonEmptyString } from './decoders';
import { mapEventToProto } from './mappers';

export type CreateReplayHandlersOptions = {
  services: EventServiceFacade;
};

export function createReplayHandlers({ services }: CreateReplayHandlersOptions) {
  return {
    getHandReplay: unary<GetHandReplayRequest, ProtoGetHandReplayResponse>(
      'GetHandReplay',
      async (request) => {
        const handId = requireNonEmptyString(request.handId, 'handId');
        const events = await services.replay.getHandEvents(
          handId,
          optionalNonEmptyString(request.requesterId),
        );
        return { handId, events: events.map(mapEventToProto) };
      },
    ),
  };
}
