import { eventStore } from "../storage/eventStore";
import { GameEvent, HandRecord } from "../domain/types";

function isParticipant(record: HandRecord, userId?: string): boolean {
  if (!userId) {
    return false;
  }
  return record.participants.some((participant) => participant.userId === userId);
}

export class PrivacyService {
  async filterHandRecord(record: HandRecord, requesterUserId?: string, isOperator = false): Promise<HandRecord> {
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
        if (participant.userId === requesterUserId) {
          return participant;
        }
        if (revealedSeats.has(participant.seatId)) {
          return participant;
        }
        return { ...participant, holeCards: null };
      }),
    };
  }

  filterEvent(
    event: GameEvent,
    requesterUserId?: string,
    isOperator = false,
    participantUserIds?: Set<string>,
    revealedSeatIds?: Set<number>
  ): GameEvent {
    if (isOperator) {
      return event;
    }

    const isParticipantUser = requesterUserId ? participantUserIds?.has(requesterUserId) : false;
    if (!isParticipantUser) {
      return this.redactEventForNonParticipant(event);
    }

    if (event.type === "CARDS_DEALT" && requesterUserId && event.userId !== requesterUserId) {
      return {
        ...event,
        payload: { ...(event.payload as Record<string, unknown>), cards: [] },
      };
    }

    if (event.type === "SHOWDOWN" && revealedSeatIds) {
      return event;
    }

    return event;
  }

  private redactEventForNonParticipant(event: GameEvent): GameEvent {
    if (event.type === "CARDS_DEALT") {
      return {
        ...event,
        payload: { ...(event.payload as Record<string, unknown>), cards: [] },
      };
    }
    if (event.type === "CARDS_REVEALED") {
      return {
        ...event,
        payload: { ...(event.payload as Record<string, unknown>), cards: [] },
      };
    }
    if (event.type === "SHOWDOWN") {
      const payload = event.payload as { reveals?: { seatId: number; cards?: unknown[]; handRank?: string }[] };
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
}

export const privacyService = new PrivacyService();
