import { err, ok, type Result } from '@specify-poker/shared';
import { asNonEmptyString, asOptionalString, isRecord } from '../shared/decoders';

export type GameEvent = {
  type: 'TURN_STARTED';
  userId: string;
  tableId?: string;
};

export type GameEventDecodeError =
  | { type: 'InvalidMessage' }
  | { type: 'UnknownType'; eventType: string };

export type GameEventDecodeResult = Result<GameEvent, GameEventDecodeError>;

export function decodeGameEvent(message: unknown): GameEventDecodeResult {
  if (!isRecord(message)) {
    return err({ type: 'InvalidMessage' });
  }

  const eventType = asNonEmptyString(message.type);
  if (!eventType) {
    return err({ type: 'InvalidMessage' });
  }

  switch (eventType) {
    case 'TURN_STARTED': {
      const userId = asNonEmptyString(message.userId);
      if (!userId) {
        return err({ type: 'InvalidMessage' });
      }

      const tableId = asOptionalString(message.tableId);
      return ok({ type: eventType, userId, tableId });
    }
    default: {
      return err({ type: 'UnknownType', eventType });
    }
  }
}

