import { TimeoutRegistry } from '@specify-poker/shared';

import type { ActionInput, Seat, Table, TableState } from '../../domain/types';
import { deriveLegalActions } from '../../engine/actionRules';
import type { TurnTimeMetric } from './submitActionChain';

type TurnStartMeta = {
  readonly handId: string;
  readonly seatId: number;
  readonly street: string;
  readonly startedAt: number;
};

type HandTimeoutMeta = {
  readonly handId: string;
  hadTimeout: boolean;
};

const DEFAULT_TURN_TIMER_SECONDS = 20;

export type TableTimersDeps = {
  runTableTask<T>(tableId: string, task: () => Promise<T>): Promise<T>;
  loadTableState(tableId: string): Promise<TableState | null>;
  repairTurnIfNeeded(table: Table, state: TableState): Promise<TableState>;
  submitActionUnlocked(
    tableId: string,
    userId: string,
    action: ActionInput,
  ): Promise<{ ok: boolean; error?: string }>;
  recordTurnTimeout(street: string, actionType: string): void;
  startNextHandIfPossible(tableId: string): Promise<void>;
  logError(meta: unknown, message: string): void;
};

export type TableTimers = {
  shutdown(): void;
  hasTurnTimer(tableId: string): boolean;
  getTurnTimeMetric(tableId: string, handId: string, seatId: number): TurnTimeMetric | null;
  clearTurnTimer(tableId: string): void;
  clearTurnStartMeta(tableId: string): void;
  noteHandStarted(tableId: string, handId: string): void;
  markHandTimedOut(tableId: string, handId: string): void;
  consumeHandTimedOut(tableId: string, handId: string): boolean;
  startTurnTimer(table: Table, state: TableState): Promise<void>;
  clearNextHandTimer(tableId: string): void;
  scheduleNextHandStart(tableId: string, delayMs: number): void;
};

function timeoutActionForTurn(hand: NonNullable<TableState['hand']>, seat: Seat): ActionInput {
  const legalActions = deriveLegalActions(hand, seat);
  const canCheck = legalActions.some((entry) => entry.type === 'CHECK');
  return canCheck ? { type: 'CHECK' } : { type: 'FOLD' };
}

export function createTableTimers(deps: TableTimersDeps): TableTimers {
  const turnTimers = new TimeoutRegistry<string>();
  const nextHandTimers = new TimeoutRegistry<string>();
  const turnStartMeta = new Map<string, TurnStartMeta>();
  const handTimeoutMeta = new Map<string, HandTimeoutMeta>();

  const clearTurnTimer = (tableId: string) => {
    turnTimers.delete(tableId);
  };

  const clearTurnStartMeta = (tableId: string) => {
    turnStartMeta.delete(tableId);
  };

  const noteHandStarted = (tableId: string, handId: string) => {
    handTimeoutMeta.set(tableId, { handId, hadTimeout: false });
  };

  const markHandTimedOut = (tableId: string, handId: string) => {
    const existing = handTimeoutMeta.get(tableId);
    if (existing && existing.handId === handId) {
      existing.hadTimeout = true;
      return;
    }
    handTimeoutMeta.set(tableId, { handId, hadTimeout: true });
  };

  const consumeHandTimedOut = (tableId: string, handId: string): boolean => {
    const existing = handTimeoutMeta.get(tableId);
    if (!existing || existing.handId !== handId) {
      return false;
    }
    handTimeoutMeta.delete(tableId);
    return existing.hadTimeout;
  };

  const getTurnTimeMetric = (
    tableId: string,
    handId: string,
    seatId: number,
  ): TurnTimeMetric | null => {
    const startedTurn = turnStartMeta.get(tableId);
    if (!startedTurn || startedTurn.handId !== handId || startedTurn.seatId !== seatId) {
      return null;
    }

    return {
      street: startedTurn.street,
      durationMs: Date.now() - startedTurn.startedAt,
    };
  };

  const handleTurnTimeout = async ({
    table,
    tableId,
    handId,
    turnSeatId,
  }: {
    table: Table;
    tableId: string;
    handId: string;
    turnSeatId: number;
  }) => {
    try {
      turnTimers.delete(tableId);

      const currentState = await deps.loadTableState(tableId);
      if (!currentState?.hand || currentState.hand.handId !== handId) {
        return;
      }
      if (currentState.hand.turn !== turnSeatId) {
        return;
      }

      const expectedTurnSeatId = currentState.hand.turn;
      const fixedState = await deps.repairTurnIfNeeded(table, currentState);
      if (!fixedState.hand) {
        return;
      }
      if (fixedState.hand.turn !== expectedTurnSeatId) {
        await startTurnTimer(table, fixedState);
        return;
      }

      const seat = fixedState.seats[fixedState.hand.turn];
      if (!seat?.userId) {
        await startTurnTimer(table, fixedState);
        return;
      }

      const actionInput = timeoutActionForTurn(fixedState.hand, seat);
      deps.recordTurnTimeout(fixedState.hand.street, actionInput.type);
      markHandTimedOut(fixedState.tableId, fixedState.hand.handId);

      const result = await deps.submitActionUnlocked(fixedState.tableId, seat.userId, actionInput);
      if (!result.ok) {
        const freshState = (await deps.loadTableState(fixedState.tableId)) ?? fixedState;
        await startTurnTimer(table, freshState);
      }
    } catch (error: unknown) {
      deps.logError({ err: error, tableId, handId, turnSeatId }, 'turn.timeout.failed');
      try {
        const freshState = await deps.loadTableState(tableId);
        if (freshState) {
          await startTurnTimer(table, freshState);
        }
      } catch (restartError) {
        deps.logError(
          { err: restartError, tableId, handId, turnSeatId },
          'turn.timeout.recovery_failed',
        );
      }
    }
  };

  const startTurnTimer = async (table: Table, state: TableState) => {
    if (!state.hand) {
      clearTurnTimer(state.tableId);
      clearTurnStartMeta(state.tableId);
      return;
    }

    clearTurnTimer(state.tableId);
    const repairedState = await deps.repairTurnIfNeeded(table, state);
    const timeoutMs = (table.config.turnTimerSeconds || DEFAULT_TURN_TIMER_SECONDS) * 1000;

    const repairedHand = repairedState.hand;
    if (!repairedHand) {
      clearTurnStartMeta(repairedState.tableId);
      return;
    }

    turnStartMeta.set(repairedState.tableId, {
      handId: repairedHand.handId,
      seatId: repairedHand.turn,
      street: repairedHand.street,
      startedAt: Date.now(),
    });

    const previousTimeout = handTimeoutMeta.get(repairedState.tableId);
    if (!previousTimeout || previousTimeout.handId !== repairedHand.handId) {
      noteHandStarted(repairedState.tableId, repairedHand.handId);
    }

    const timer = setTimeout(() => {
      void deps.runTableTask(repairedState.tableId, () =>
        handleTurnTimeout({
          table,
          tableId: repairedState.tableId,
          handId: repairedHand.handId,
          turnSeatId: repairedHand.turn,
        }),
      );
    }, timeoutMs);

    turnTimers.set(repairedState.tableId, timer);
  };

  const clearNextHandTimer = (tableId: string) => {
    nextHandTimers.delete(tableId);
  };

  const scheduleNextHandStart = (tableId: string, delayMs: number) => {
    clearNextHandTimer(tableId);
    const timer = setTimeout(() => {
      nextHandTimers.delete(tableId);
      void deps.runTableTask(tableId, () => deps.startNextHandIfPossible(tableId));
    }, delayMs);
    nextHandTimers.set(tableId, timer);
  };

  const shutdown = () => {
    turnTimers.clear();
    nextHandTimers.clear();
    turnStartMeta.clear();
    handTimeoutMeta.clear();
  };

  return {
    shutdown,
    hasTurnTimer: (tableId: string) => turnTimers.has(tableId),
    getTurnTimeMetric,
    clearTurnTimer,
    clearTurnStartMeta,
    noteHandStarted,
    markHandTimedOut,
    consumeHandTimedOut,
    startTurnTimer,
    clearNextHandTimer,
    scheduleNextHandStart,
  };
}

