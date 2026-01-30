import { eventStore } from '../storage/eventStore';
import type { GameEvent } from '../domain/types';
import { isRecord } from '../errors';
import { privacyService } from './privacyService';

function extractParticipants(events: GameEvent[]): Set<string> {
  const participants = new Set<string>();
  const handStarted = events.find((event) => event.type === 'HAND_STARTED');
  if (!handStarted || !isRecord(handStarted.payload)) {
    return participants;
  }

  const seatsValue = handStarted.payload.seats;
  if (!Array.isArray(seatsValue)) {
    return participants;
  }

  for (const seat of seatsValue) {
    if (!isRecord(seat)) {
      continue;
    }
    const userId = seat.userId;
    if (typeof userId === 'string' && userId.trim().length > 0) {
      participants.add(userId);
    }
  }
  return participants;
}

export type ReplayServiceDependencies = {
  eventStore: Pick<typeof eventStore, 'queryEvents'>;
  privacyService: Pick<typeof privacyService, 'createEventFilter'>;
};

export class ReplayService {
  constructor(private readonly deps: ReplayServiceDependencies = { eventStore, privacyService }) {}

  async getHandEvents(
    handId: string,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<GameEvent[]> {
    const result = await this.deps.eventStore.queryEvents({ handId, limit: 1000 });
    const events = result.events;

    if (isOperator) {
      return events;
    }

    const participantUserIds = extractParticipants(events);

    const filter = this.deps.privacyService.createEventFilter({
      requesterUserId,
      isOperator,
      participantUserIds,
    });

    return events.map(filter);
  }
}

export const replayService = new ReplayService();
