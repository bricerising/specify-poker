import { handStore } from '../storage/handStore';
import type { HandRecord } from '../domain/types';
import { privacyService } from './privacyService';
import { PermissionDeniedError } from '../errors';

export class HandRecordService {
  async getHandRecord(
    handId: string,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<HandRecord | null> {
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
    isOperator = false,
  ): Promise<{ hands: HandRecord[]; total: number }> {
    const result = await handStore.getHandHistory(tableId, limit, offset);
    const shouldRedact = !isOperator && requesterUserId;
    if (!shouldRedact) {
      return result;
    }

    const visibleHands = result.hands.filter((hand) => isParticipant(hand, requesterUserId));
    const redacted = await Promise.all(
      visibleHands.map((hand) =>
        privacyService.filterHandRecord(hand, requesterUserId, isOperator),
      ),
    );
    return { hands: redacted, total: redacted.length };
  }

  async getHandsForUser(
    userId: string,
    limit = 20,
    offset = 0,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<{ hands: HandRecord[]; total: number }> {
    const isUnauthorized = !isOperator && requesterUserId && requesterUserId !== userId;
    if (isUnauthorized) {
      throw new PermissionDeniedError('Requester not authorized for user hand history');
    }
    const result = await handStore.getHandsForUser(userId, limit, offset);
    const shouldRedact = !isOperator && requesterUserId;
    if (!shouldRedact) {
      return result;
    }
    const redacted = await Promise.all(
      result.hands.map((hand) =>
        privacyService.filterHandRecord(hand, requesterUserId, isOperator),
      ),
    );
    return { hands: redacted, total: result.total };
  }
}

export const handRecordService = new HandRecordService();

function isParticipant(hand: HandRecord, requesterUserId?: string): boolean {
  if (!requesterUserId) {
    return false;
  }
  return hand.participants.some((participant) => participant.userId === requesterUserId);
}
