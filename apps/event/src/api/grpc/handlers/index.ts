import { createEventHandlers } from './events';
import { createHandHistoryHandlers } from './handHistory';
import { createReplayHandlers } from './replay';
import { createStreamingHandlers } from './streaming';
import { createEventServiceFacade, type EventServiceFacade } from '../../../services/facade';

export type CreateHandlersOptions = {
  services?: EventServiceFacade;
};

export function createHandlers(options: CreateHandlersOptions = {}) {
  const services = options.services ?? createEventServiceFacade();
  return {
    ...createEventHandlers({ services }),
    ...createHandHistoryHandlers({ services }),
    ...createReplayHandlers({ services }),
    ...createStreamingHandlers({ services }),
  };
}
