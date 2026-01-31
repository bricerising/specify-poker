import { fireAndForget } from '@specify-poker/shared';
import type { GameEventType as GameEventTypeValue } from '../../domain/events';

export type GameEventEmitParams = {
  readonly tableId: string;
  readonly handId: string | undefined;
  readonly userId: string | undefined;
  readonly seatId: number | undefined;
  readonly type: GameEventTypeValue;
  readonly payload: Record<string, unknown>;
  readonly idempotencyKey?: string;
};

export type GameEventEmitter = {
  emit(params: GameEventEmitParams): Promise<void>;
  emitDetached(params: GameEventEmitParams): void;
};

export function createGameEventEmitter(options: {
  emit(params: GameEventEmitParams): Promise<void>;
  onError(error: unknown, params: GameEventEmitParams): void;
}): GameEventEmitter {
  return {
    emit: options.emit,
    emitDetached: (params) => {
      fireAndForget(() => options.emit(params), (error) => options.onError(error, params));
    },
  };
}

