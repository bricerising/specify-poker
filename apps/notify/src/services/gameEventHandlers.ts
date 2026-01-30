import type { NotificationPayload } from '../domain/types';
import logger from '../observability/logger';
import type { GameEvent } from './gameEvents';
import type { PushSender } from './pushSender';

export type GameEventHandlers = {
  [Type in GameEvent['type']]: (event: Extract<GameEvent, { type: Type }>) => Promise<void>;
};

function createTurnStartedPayload(tableId?: string): NotificationPayload {
  return {
    title: "It's your turn!",
    body: `Action is on you at table ${tableId || 'unknown'}.`,
    url: tableId ? `/tables/${tableId}` : '/',
    tag: tableId ? `turn-${tableId}` : undefined,
    data: {
      type: 'turn_alert',
      tableId,
    },
  };
}

export function createGameEventHandlers(pushSender: PushSender): GameEventHandlers {
  return {
    TURN_STARTED: async ({ userId, tableId }) => {
      logger.info({ userId, tableId }, 'Triggering turn alert');
      const payload = createTurnStartedPayload(tableId);
      await pushSender.sendToUser(userId, payload);
    },
  };
}
