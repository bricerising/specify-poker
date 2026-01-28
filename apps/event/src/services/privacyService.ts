import { eventStore } from '../storage/eventStore';
import type { GameEvent, HandRecord } from '../domain/types';

function isParticipant(record: HandRecord, userId?: string): boolean {
  return Boolean(
    userId && record.participants.some((participant) => participant.userId === userId),
  );
}

export class PrivacyService {
  async filterHandRecord(
    record: HandRecord,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<HandRecord> {
    if (isOperator) {
      return record;
    }

    if (!requesterUserId || !isParticipant(record, requesterUserId)) {
      return {
        ...record,
        participants: record.participants.map((participant) => ({
          ...participant,
          holeCards: null,
        })),
      };
    }

    const revealedSeats = await eventStore.getShowdownReveals(record.handId);

    return {
      ...record,
      participants: record.participants.map((participant) => {
        const isVisible =
          participant.userId === requesterUserId || revealedSeats.has(participant.seatId);
        return isVisible ? participant : { ...participant, holeCards: null };
      }),
    };
  }

  filterEvent(
    event: GameEvent,
    requesterUserId?: string,
    isOperator = false,
    participantUserIds?: Set<string>,
  ): GameEvent {
    if (isOperator) {
      return event;
    }

    const isParticipantUser = requesterUserId ? participantUserIds?.has(requesterUserId) : false;
    if (!isParticipantUser) {
      return this.redactEventForNonParticipant(event);
    }

    if (event.type === 'CARDS_DEALT' && requesterUserId && event.userId !== requesterUserId) {
      return {
        ...event,
        payload: { ...(event.payload as Record<string, unknown>), cards: [] },
      };
    }

    return event;
  }

  private redactEventForNonParticipant(event: GameEvent): GameEvent {
    if (event.type === 'CARDS_DEALT' || event.type === 'CARDS_REVEALED') {
      return this.redactCardsPayload(event);
    }
    if (event.type === 'SHOWDOWN') {
      const payload = event.payload as {
        reveals?: { seatId: number; cards?: unknown[]; handRank?: string }[];
      };
      const reveals = (payload.reveals || []).map((reveal) => ({
        ...reveal,
        cards: [],
      }));
      return {
        ...event,
        payload: { ...payload, reveals },
      };
    }
    return event;
  }

  private redactCardsPayload(event: GameEvent): GameEvent {
    return {
      ...event,
      payload: { ...(event.payload as Record<string, unknown>), cards: [] },
    };
  }
}

export const privacyService = new PrivacyService();
