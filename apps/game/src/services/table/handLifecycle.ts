import { seatAt } from '../../domain/seats';
import type { Table, TableState } from '../../domain/types';
import { GameEventType, type GameEventType as GameEventTypeValue } from '../../domain/events';
import { startHand } from '../../engine/handEngine';
import type { TableEconomy } from './tableEconomy';
import type { TableTimers } from './tableTimers';

/** Minimum players required to start a hand */
const MIN_PLAYERS_FOR_HAND = 2;

/** Delay before starting next hand after one completes (ms) */
const NEXT_HAND_DELAY_MS = 3000;

type LoggerLike = {
  warn(meta: unknown, message?: string): void;
  error(meta: unknown, message?: string): void;
};

type MetricsLike = {
  recordHandCompleted(tableId: string, outcome: string): void;
  recordHandStarted(tableId: string): void;
};

type PublisherLike = {
  publishTableAndLobby(table: Table, state: TableState): Promise<void>;
};

type TableStoreLike = {
  save(table: Table): Promise<void>;
  get(tableId: string): Promise<Table | null>;
};

type TableStateStoreLike = {
  save(state: TableState): Promise<void>;
  get(tableId: string): Promise<TableState | null>;
};

type EmitGameEventFn = (
  tableId: string,
  handId: string | undefined,
  userId: string | undefined,
  seatId: number | undefined,
  type: GameEventTypeValue,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
) => Promise<void>;

export type HandLifecycleDeps = {
  readonly tableStore: TableStoreLike;
  readonly tableStateStore: TableStateStoreLike;
  readonly publisher: PublisherLike;
  readonly tableEconomy: TableEconomy;
  readonly tableTimers: TableTimers;
  readonly metrics: MetricsLike;
  readonly logger: LoggerLike;
  readonly emitGameEvent: EmitGameEventFn;
  readonly touchState: (state: TableState) => void;
};

export type HandLifecycle = {
  checkStartHand(table: Table, state: TableState): Promise<void>;
  handleHandEnded(table: Table, state: TableState): Promise<void>;
  startNextHandIfPossible(tableId: string): Promise<void>;
};

export function createHandLifecycle(deps: HandLifecycleDeps): HandLifecycle {
  const {
    tableStore,
    tableStateStore,
    publisher,
    tableEconomy,
    tableTimers,
    metrics,
    logger,
    emitGameEvent,
    touchState,
  } = deps;

  const emitGameEventDetached = (...args: Parameters<EmitGameEventFn>): void => {
    const [tableId, handId, userId, seatId, type] = args;
    void emitGameEvent(...args).catch((error: unknown) => {
      logger.error({ err: error, tableId, handId, userId, seatId, type }, 'game_event.emit.failed');
    });
  };

  async function checkStartHand(table: Table, state: TableState): Promise<void> {
    if (table.status === 'PLAYING' || state.hand) {
      return;
    }

    const activePlayers = state.seats.filter((seat) => seat.userId && seat.status === 'SEATED');
    if (activePlayers.length < MIN_PLAYERS_FOR_HAND) {
      return;
    }

    const updatedState = startHand(state, table.config);
    table.status = 'PLAYING';
    await tableStore.save(table);
    await tableStateStore.save(updatedState);
    await publisher.publishTableAndLobby(table, updatedState);

    if (updatedState.hand) {
      metrics.recordHandStarted(table.tableId);
      tableTimers.noteHandStarted(table.tableId, updatedState.hand.handId);

      const contributionResult = await tableEconomy.recordHandStartContributions({
        tableId: table.tableId,
        handId: updatedState.hand.handId,
        actions: updatedState.hand.actions,
      });
      if (contributionResult.type === 'unavailable') {
        emitGameEventDetached(
          table.tableId,
          updatedState.hand.handId,
          undefined,
          undefined,
          GameEventType.BALANCE_UNAVAILABLE,
          { action: 'RECORD_CONTRIBUTION' },
        );
      } else if (contributionResult.type === 'error') {
        logger.warn(
          {
            tableId: table.tableId,
            handId: updatedState.hand.handId,
            error: contributionResult.error,
          },
          'balance.contribution.failed',
        );
      }
    }

    const participants = updatedState.seats
      .filter((seat) => seat.status === 'ACTIVE' || seat.status === 'ALL_IN')
      .map((seat) => seat.userId)
      .filter((value): value is string => Boolean(value));

    const startedHandId = updatedState.hand?.handId;
    emitGameEventDetached(
      table.tableId,
      startedHandId,
      undefined,
      undefined,
      GameEventType.HAND_STARTED,
      {
        buttonSeat: updatedState.button,
        participants,
      },
      startedHandId ? `event:${GameEventType.HAND_STARTED}:${startedHandId}` : undefined,
    );

    await tableTimers.startTurnTimer(table, updatedState);
  }

  async function startNextHandIfPossible(tableId: string): Promise<void> {
    try {
      const [freshState, freshTable] = await Promise.all([
        tableStateStore.get(tableId),
        tableStore.get(tableId),
      ]);
      if (freshState && freshTable) {
        await checkStartHand(freshTable, freshState);
      }
    } catch (error) {
      logger.error({ err: error, tableId }, 'hand.restart.failed');
    }
  }

  async function handleHandEnded(table: Table, state: TableState): Promise<void> {
    const hand = state.hand;
    if (!hand) {
      return;
    }

    const hadTimeout = tableTimers.consumeHandTimedOut(table.tableId, hand.handId);
    const lastAction = hand.actions[hand.actions.length - 1];
    const outcome = hadTimeout ? 'timeout' : lastAction?.type === 'FOLD' ? 'fold_win' : 'showdown';
    metrics.recordHandCompleted(table.tableId, outcome);

    const winnerUserIds = (hand.winners || [])
      .map((seatId) => seatAt(state.seats, seatId)?.userId)
      .filter((value): value is string => Boolean(value));

    emitGameEventDetached(
      table.tableId,
      hand.handId,
      undefined,
      undefined,
      GameEventType.HAND_ENDED,
      {
        winners: hand.winners ?? [],
        winnerUserIds,
        rakeAmount: hand.rakeAmount,
      },
      `event:${GameEventType.HAND_ENDED}:${hand.handId}`,
    );

    const settleResult = await tableEconomy.settleHand({
      tableId: table.tableId,
      handId: hand.handId,
      buttonSeat: state.button,
      seats: state.seats,
      pots: hand.pots,
    });

    if (settleResult.type === 'unavailable') {
      emitGameEventDetached(
        table.tableId,
        hand.handId,
        undefined,
        undefined,
        GameEventType.BALANCE_UNAVAILABLE,
        {
          action: 'SETTLE_POT',
        },
      );
    } else if (settleResult.type === 'error') {
      emitGameEventDetached(
        table.tableId,
        hand.handId,
        undefined,
        undefined,
        GameEventType.SETTLEMENT_FAILED,
        {
          error: settleResult.error,
        },
      );
    }

    state.hand = null;
    touchState(state);
    table.status = 'WAITING';
    await tableStore.save(table);
    await tableStateStore.save(state);
    await publisher.publishTableAndLobby(table, state);

    tableTimers.scheduleNextHandStart(state.tableId, NEXT_HAND_DELAY_MS);
  }

  return {
    checkStartHand,
    handleHandEnded,
    startNextHandIfPossible,
  };
}
