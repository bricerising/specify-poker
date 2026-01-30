import { handStore } from '../storage/handStore';
import type { HandRecord } from '../domain/types';
import { privacyService } from './privacyService';
import { PermissionDeniedError } from '../errors';

export type HandRecordServiceDependencies = {
  handStore: Pick<typeof handStore, 'getHandRecord' | 'getHandHistory' | 'getHandsForUser'>;
  privacyService: Pick<typeof privacyService, 'filterHandRecord'>;
};

export class HandRecordService {
  constructor(
    private readonly deps: HandRecordServiceDependencies = { handStore, privacyService },
  ) {}

  async getHandRecord(
    handId: string,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<HandRecord | null> {
    const record = await this.deps.handStore.getHandRecord(handId);
    if (!record) {
      return null;
    }
    return this.deps.privacyService.filterHandRecord(record, requesterUserId, isOperator);
  }

  async getHandHistory(
    tableId: string,
    limit = 20,
    offset = 0,
    requesterUserId?: string,
    isOperator = false,
  ): Promise<{ hands: HandRecord[]; total: number }> {
    const result = await this.deps.handStore.getHandHistory(tableId, limit, offset);
    const shouldRedact = !isOperator && Boolean(requesterUserId);
    if (!shouldRedact) {
      return result;
    }

    const visibleHands = result.hands.filter((hand) => isParticipant(hand, requesterUserId));
    const redacted = await Promise.all(
      visibleHands.map((hand) =>
        this.deps.privacyService.filterHandRecord(hand, requesterUserId, isOperator),
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
    const result = await this.deps.handStore.getHandsForUser(userId, limit, offset);
    const shouldRedact = !isOperator && Boolean(requesterUserId);
    if (!shouldRedact) {
      return result;
    }
    const redacted = await Promise.all(
      result.hands.map((hand) =>
        this.deps.privacyService.filterHandRecord(hand, requesterUserId, isOperator),
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
