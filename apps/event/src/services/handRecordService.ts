import { handStore } from "../storage/handStore";
import { HandRecord } from "../domain/types";
import { privacyService } from "./privacyService";

export class HandRecordService {
  async getHandRecord(handId: string, requesterUserId?: string, isOperator = false): Promise<HandRecord | null> {
    const record = await handStore.getHandRecord(handId);
    if (!record) {
      return null;
    }
    return privacyService.filterHandRecord(record, requesterUserId, isOperator);
  }

  async getHandHistory(
    tableId: string,
    limit = 20,
    offset = 0,
    requesterUserId?: string,
    isOperator = false
  ): Promise<{ hands: HandRecord[]; total: number }> {
    const result = await handStore.getHandHistory(tableId, limit, offset);
    if (isOperator || !requesterUserId) {
      return result;
    }

    const visibleHands = result.hands.filter((hand) =>
      hand.participants.some((participant) => participant.userId === requesterUserId)
    );
    const redacted = await Promise.all(
      visibleHands.map((hand) => privacyService.filterHandRecord(hand, requesterUserId, isOperator))
    );
    return { hands: redacted, total: redacted.length };
  }

  async getHandsForUser(
    userId: string,
    limit = 20,
    offset = 0,
    requesterUserId?: string,
    isOperator = false
  ): Promise<{ hands: HandRecord[]; total: number }> {
    if (!isOperator && requesterUserId && requesterUserId !== userId) {
      throw new Error("Requester not authorized for user hand history");
    }
    const result = await handStore.getHandsForUser(userId, limit, offset);
    if (isOperator || !requesterUserId) {
      return result;
    }
    const redacted = await Promise.all(
      result.hands.map((hand) => privacyService.filterHandRecord(hand, requesterUserId, isOperator))
    );
    return { hands: redacted, total: result.total };
  }
}

export const handRecordService = new HandRecordService();
