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

export class ReplayService {
  async getHandEvents(
    handId: string,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<GameEvent[]> {
    const result = await eventStore.queryEvents({ handId, limit: 1000 });
    const events = result.events;

    if (isOperator) {
      return events;
    }

    const participantUserIds = extractParticipants(events);

    return events.map((event) =>
      privacyService.filterEvent(event, requesterUserId, isOperator, participantUserIds),
    );
  }
}

export const replayService = new ReplayService();
