import { handStore } from '../storage/handStore';
import { HandRecord } from '../domain/types';

export class HandRecordService {
  async getHandRecord(handId: string, requesterUserId?: string, isOperator = false): Promise<HandRecord | null> {
    const record = await handStore.getHandRecord(handId);
    if (!record) return null;

    return this.redactHandRecord(record, requesterUserId, isOperator);
  }

  async getHandHistory(tableId: string, limit?: number, offset?: number): Promise<{ hands: HandRecord[]; total: number }> {
    const result = await handStore.getHandHistory(tableId, limit, offset);
    // Note: Redaction for bulk history might be needed depending on requirements
    // For now, assume table history is public (minus hole cards which should already be redacted if not showdown)
    return result;
  }

  async getHandsForUser(userId: string, limit?: number, offset?: number): Promise<{ hands: HandRecord[]; total: number }> {
    return await handStore.getHandsForUser(userId, limit, offset);
  }

  private redactHandRecord(record: HandRecord, requesterUserId?: string, isOperator = false): HandRecord {
    if (isOperator) return record;

    const redacted = { ...record };
    redacted.participants = record.participants.map(p => {
      // Show hole cards if:
      // 1. It's the requester's own cards
      // 2. The hand reached showdown and cards were shown (this logic depends on how 'result' or 'hole_cards' is populated)
      
      const canSeeCards = p.user_id === requesterUserId || (p.hole_cards && p.hole_cards.length > 0 && record.winners.some(w => w.user_id === p.user_id));
      // Simple logic: if hole_cards are present in DB, they are considered revealed unless we explicitly redact them.
      // In many implementations, hole_cards are only saved to the HandRecord if they were revealed.
      // If we save ALL hole cards for audit, we MUST redact them here.
      
      if (!canSeeCards) {
        return { ...p, hole_cards: [] };
      }
      return p;
    });

    return redacted;
  }
}

export const handRecordService = new HandRecordService();
