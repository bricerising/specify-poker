import { randomUUID } from 'crypto';

import { GameEventType } from '../domain/events';
import logger from '../observability/logger';
import { createLazyUnaryCallResultProxy, toStruct } from '@specify-poker/shared';
import { getEventClient } from '../api/grpc/clients';

export { GameEventType as EventTypes } from '../domain/events';

const unaryEventClient = createLazyUnaryCallResultProxy(getEventClient);

export interface GameEvent {
  type: string;
  tableId: string;
  handId?: string;
  userId?: string;
  seatId?: number;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PublishResult {
  success: boolean;
  eventId?: string;
}

export async function publishEvent(event: GameEvent): Promise<PublishResult> {
  try {
    const call = await unaryEventClient.PublishEvent({
      type: event.type,
      table_id: event.tableId,
      hand_id: event.handId,
      user_id: event.userId,
      seat_id: event.seatId,
      payload: toStruct(event.payload),
      idempotency_key: event.idempotencyKey ?? randomUUID(),
    });

    if (!call.ok) {
      logger.error({ err: call.error, event }, 'Event publish failed');
      return { success: false };
    }

    const response = call.value;
    if (!response.success) {
      logger.error({ event }, 'Event publish failed');
    }
    return { success: response.success, eventId: response.event_id };
  } catch (error: unknown) {
    logger.error({ err: error, event }, 'Event publish failed');
    return { success: false };
  }
}

export async function publishEvents(
  events: GameEvent[],
): Promise<{ success: boolean; eventIds?: string[] }> {
  try {
    const call = await unaryEventClient.PublishEvents({
      events: events.map((event) => ({
        type: event.type,
        table_id: event.tableId,
        hand_id: event.handId,
        user_id: event.userId,
        seat_id: event.seatId,
        payload: toStruct(event.payload),
        idempotency_key: event.idempotencyKey ?? randomUUID(),
      })),
    });

    if (!call.ok) {
      logger.error({ err: call.error }, 'Batch event publish failed');
      return { success: false };
    }

    const response = call.value;
    if (!response.success) {
      logger.error({ eventCount: events.length }, 'Batch event publish failed');
    }
    return { success: response.success, eventIds: response.event_ids };
  } catch (error: unknown) {
    logger.error({ err: error }, 'Batch event publish failed');
    return { success: false };
  }
}

// Convenience functions for common events
export async function emitTableCreated(
  tableId: string,
  ownerId: string,
  tableName: string,
  config: Record<string, unknown>,
) {
  return publishEvent({
    type: GameEventType.TABLE_CREATED,
    tableId,
    userId: ownerId,
    payload: { tableName, config },
    idempotencyKey: `table-created-${tableId}`,
  });
}

export async function emitPlayerJoined(
  tableId: string,
  userId: string,
  seatId: number,
  buyInAmount: number,
) {
  return publishEvent({
    type: GameEventType.PLAYER_JOINED,
    tableId,
    userId,
    seatId,
    payload: { buyInAmount },
    idempotencyKey: `player-joined-${tableId}-${userId}-${Date.now()}`,
  });
}

export async function emitPlayerLeft(
  tableId: string,
  userId: string,
  seatId: number,
  finalStack: number,
) {
  return publishEvent({
    type: GameEventType.PLAYER_LEFT,
    tableId,
    userId,
    seatId,
    payload: { finalStack },
    idempotencyKey: `player-left-${tableId}-${userId}-${Date.now()}`,
  });
}

export async function emitHandStarted(
  tableId: string,
  handId: string,
  participants: Array<Record<string, unknown>>,
  button: number,
) {
  return publishEvent({
    type: GameEventType.HAND_STARTED,
    tableId,
    handId,
    payload: { participants, button },
    idempotencyKey: `hand-started-${handId}`,
  });
}

export async function emitActionTaken(
  tableId: string,
  handId: string,
  userId: string,
  seatId: number,
  action: string,
  amount: number,
  street: string,
) {
  return publishEvent({
    type: GameEventType.ACTION_TAKEN,
    tableId,
    handId,
    userId,
    seatId,
    payload: { action, amount, street },
    idempotencyKey: `action-${handId}-${seatId}-${Date.now()}`,
  });
}

export async function emitHandCompleted(
  tableId: string,
  handId: string,
  winners: Array<Record<string, unknown>>,
  communityCards: string[],
  rake: number,
) {
  return publishEvent({
    type: GameEventType.HAND_COMPLETED,
    tableId,
    handId,
    payload: { winners, communityCards, rake },
    idempotencyKey: `hand-completed-${handId}`,
  });
}
