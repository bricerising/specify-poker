import { eventStore } from "../storage/eventStore";
import { GameEvent } from "../domain/types";
import { privacyService } from "./privacyService";

function extractParticipants(events: GameEvent[]): Set<string> {
  const participants = new Set<string>();
  const handStarted = events.find((event) => event.type === "HAND_STARTED");
  const payload = handStarted?.payload as { seats?: { userId?: string }[] } | undefined;
  for (const seat of payload?.seats || []) {
    if (seat.userId) {
      participants.add(seat.userId);
    }
  }
  return participants;
}

export class ReplayService {
  async getHandEvents(handId: string, requesterUserId?: string, isOperator = false): Promise<GameEvent[]> {
    const result = await eventStore.queryEvents({ handId, limit: 1000 });
    const events = result.events;

    if (isOperator) {
      return events;
    }

    const participantUserIds = extractParticipants(events);

    return events.map((event) => privacyService.filterEvent(event, requesterUserId, isOperator, participantUserIds));
  }
}

export const replayService = new ReplayService();
