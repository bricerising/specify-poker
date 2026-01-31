import { seatAt } from '../../domain/seats';
import type {
  ActionInput,
  Seat,
  Table,
  TableConfig,
  TableState,
  TableSummary,
} from '../../domain/types';
import { GameEventType } from '../../domain/events';
import { applyAction } from '../../engine/handEngine';
import type { BalanceClient } from '../../clients/balanceClient';
import type { PublishResult, GameEvent } from '../../clients/eventClient';
import { coerceNumber } from '../../utils/coerce';
import { KeyedTaskQueue } from '../../utils/keyedTaskQueue';
import { fireAndForget } from '@specify-poker/shared';
import type { TableQueries } from './tableQueries';
import type { TablePublisher } from './tablePublisher';
import { redactTableState } from './tableViewBuilder';
import { resolveSeatForUser as resolveSeatForUserInState } from './seatResolver';
import type { TableEconomy } from './tableEconomy';
import { createLeaveSeatChain, type LeaveSeatUnlockedResult } from './leaveSeatChain';
import {
  createSubmitActionChain,
  type SubmitActionChainContext,
  type TurnTimeMetric,
} from './submitActionChain';
import {
  createJoinSeatChain,
  type JoinSeatChainContext,
  type JoinSeatChainResult,
  type JoinSeatResponse,
} from './joinSeatChain';
import { createTableTimers, type TableTimers } from './tableTimers';
import {
  createSeatBuyInChain,
  type FinalizeReservedSeatJoinResult,
  type SeatBuyInChainContext,
} from './seatBuyInChain';
import { createHandLifecycle, type HandLifecycle } from './handLifecycle';
import { createGameEventEmitter, type GameEventEmitter } from './gameEventEmitter';

type LoggerLike = {
  info(meta: unknown, message?: string): void;
  warn(meta: unknown, message?: string): void;
  error(meta: unknown, message?: string): void;
};

type MetricsLike = {
  recordAction(actionType: string): void;
  recordHandCompleted(tableId: string, outcome: string): void;
  recordHandStarted(tableId: string): void;
  recordSeatJoin(result: 'ok' | 'error', metric: string): void;
  recordTurnTime(street: string, actionType: string, durationMs: number): void;
  recordTurnTimeout(street: string, actionType: string): void;
  setActiveTables(count: number): void;
  setSeatedPlayers(count: number): void;
  setSpectatorCount(count: number): void;
};

type ClockLike = {
  nowIso(): string;
};

type IdGeneratorLike = {
  randomUUID(): string;
};

export type TableServiceDeps = {
  readonly tableQueries: TableQueries;
  readonly tableEconomy: TableEconomy;
  readonly tableStore: {
    save(table: Table): Promise<void>;
    get(tableId: string): Promise<Table | null>;
    list(): Promise<string[]>;
    delete(tableId: string, ownerId: string): Promise<void>;
  };
  readonly tableStateStore: {
    save(state: TableState): Promise<void>;
    get(tableId: string): Promise<TableState | null>;
    delete(tableId: string): Promise<void>;
  };
  readonly publisher: TablePublisher;
  readonly balanceClient: BalanceClient;
  readonly publishEvent: (event: GameEvent) => Promise<PublishResult>;
  readonly metrics: MetricsLike;
  readonly logger: LoggerLike;
  readonly clock: ClockLike;
  readonly ids: IdGeneratorLike;
};

// ============================================================================
// Constants
// ============================================================================

/** Default stack size when not specified in table config */
const DEFAULT_STARTING_STACK = 200;

// ============================================================================
// Types
// ============================================================================

type OkResult = { readonly ok: true };
type ErrorResult = { readonly ok: false; readonly error: string };

type GetTableStateResponse = {
  readonly state: TableState;
  readonly holeCards: NonNullable<Seat['holeCards']>;
};

export class TableService {
  private readonly deps: TableServiceDeps;
  private readonly eventEmitter: GameEventEmitter;

  private readonly submitActionChain: (ctx: SubmitActionChainContext) => Promise<void>;
  private readonly joinSeatChain: (ctx: JoinSeatChainContext) => Promise<JoinSeatChainResult>;
  private readonly seatBuyInChain: (
    ctx: SeatBuyInChainContext,
  ) => Promise<FinalizeReservedSeatJoinResult>;
  private readonly leaveSeatChain: (ctx: {
    tableId: string;
    userId: string;
  }) => Promise<LeaveSeatUnlockedResult>;
  private readonly tableTimers: TableTimers;
  private readonly handLifecycle: HandLifecycle;
  private readonly tableTaskQueue = new KeyedTaskQueue();
  private readonly seatBuyInQueue = new KeyedTaskQueue();

  constructor(deps: TableServiceDeps) {
    this.deps = deps;
    this.eventEmitter = createGameEventEmitter({
      emit: async (event) => {
        await this.deps.publishEvent({
          type: event.type,
          tableId: event.tableId,
          handId: event.handId,
          userId: event.userId,
          seatId: event.seatId,
          payload: event.payload,
          idempotencyKey: event.idempotencyKey,
        });
      },
      onError: (error, event) => {
        this.deps.logger.error(
          {
            err: error,
            tableId: event.tableId,
            handId: event.handId,
            userId: event.userId,
            seatId: event.seatId,
            type: event.type,
          },
          'game_event.emit.failed',
        );
      },
    });

    this.tableTimers = createTableTimers({
      runTableTask: (tableId, task) => this.runTableTask(tableId, task),
      loadTableState: (tableId) => this.deps.tableStateStore.get(tableId),
      repairTurnIfNeeded: (table, state) => this.repairTurnIfNeeded(table, state),
      submitActionUnlocked: (tableId, userId, action) =>
        this.submitActionUnlocked(tableId, userId, action),
      recordTurnTimeout: (street, actionType) =>
        this.deps.metrics.recordTurnTimeout(street, actionType),
      startNextHandIfPossible: (tableId) => this.handLifecycle.startNextHandIfPossible(tableId),
      logError: (meta, message) => this.deps.logger.error(meta, message),
    });

    this.submitActionChain = createSubmitActionChain({
      recordTurnTime: (street, actionType, durationMs) =>
        this.deps.metrics.recordTurnTime(street, actionType, durationMs),
      recordAction: (actionType) => this.deps.metrics.recordAction(actionType),
      saveState: (state) => this.deps.tableStateStore.save(state),
      publishTableState: (table, state) => this.deps.publisher.publishTableState(table, state),
      recordActionContribution: (params) =>
        this.deps.tableEconomy.recordActionContribution({
          tableId: params.tableId,
          handId: params.handId,
          action: params.action,
          amount: params.amount,
        }),
      warn: (meta, message) => this.deps.logger.warn(meta, message),
      eventEmitter: this.eventEmitter,
      clearTurnTimer: (tableId) => this.tableTimers.clearTurnTimer(tableId),
      clearTurnStartMeta: (tableId) => this.tableTimers.clearTurnStartMeta(tableId),
      handleHandEnded: (table, state) => this.handLifecycle.handleHandEnded(table, state),
      startTurnTimer: (table, state) => this.tableTimers.startTurnTimer(table, state),
    });

    this.joinSeatChain = createJoinSeatChain({
      newIdempotencyKey: (prefix) => this.newIdempotencyKey(prefix),
      touchState: (state) => this.touchState(state),
      saveState: (state) => this.deps.tableStateStore.save(state),
      publishTableAndLobby: (table, state) =>
        this.deps.publisher.publishTableAndLobby(table, state),
      recordSeatJoin: (result, metric) => this.deps.metrics.recordSeatJoin(result, metric),
    });

    this.handLifecycle = createHandLifecycle({
      tableStore: this.deps.tableStore,
      tableStateStore: this.deps.tableStateStore,
      publisher: this.deps.publisher,
      tableEconomy: this.deps.tableEconomy,
      tableTimers: this.tableTimers,
      metrics: this.deps.metrics,
      logger: this.deps.logger,
      eventEmitter: this.eventEmitter,
      touchState: (state) => this.touchState(state),
    });

    this.seatBuyInChain = createSeatBuyInChain({
      runTableTask: (tableId, task) => this.runTableTask(tableId, task),
      loadTableState: (tableId) => this.deps.tableStateStore.get(tableId),
      loadTable: (tableId) => this.deps.tableStore.get(tableId),
      touchState: (state) => this.touchState(state),
      saveState: (state) => this.deps.tableStateStore.save(state),
      publishTableAndLobby: (table, state) =>
        this.deps.publisher.publishTableAndLobby(table, state),
      checkStartHand: (table, state) => this.handLifecycle.checkStartHand(table, state),
      newIdempotencyKey: (prefix) => this.newIdempotencyKey(prefix),
      reserveForBuyIn: (params) => this.deps.balanceClient.reserveForBuyIn(params),
      commitReservation: (params) => this.deps.balanceClient.commitReservation(params),
      releaseReservation: (params) => this.deps.balanceClient.releaseReservation(params),
      rollbackSeat: (params) =>
        this.rollbackSeat(params.tableId, params.seatId, params.userId, params.reservationId),
      logError: (meta, message) => this.deps.logger.error(meta, message),
      eventEmitter: this.eventEmitter,
    });

    this.leaveSeatChain = createLeaveSeatChain({
      loadTableAndState: (tableId) => this.deps.tableQueries.loadTableAndState(tableId),
      resolveSeatForUser: (state, userId) => this.resolveSeatForUser(state, userId),
      releaseReservation: (params) => this.deps.balanceClient.releaseReservation(params),
      warn: (meta, message) => this.deps.logger.warn(meta, message),
      clearSeatOwnership: (seat) => this.clearSeatOwnership(seat),
      touchState: (state) => this.touchState(state),
      saveState: (state) => this.deps.tableStateStore.save(state),
      publishTableAndLobby: (table, state) =>
        this.deps.publisher.publishTableAndLobby(table, state),
      startTurnTimer: (table, state) => this.tableTimers.startTurnTimer(table, state),
      findNextActiveTurn: (seats, startSeatId) => this.findNextActiveTurn(seats, startSeatId),
    });
  }

  shutdown(): void {
    this.tableTaskQueue.clear();
    this.seatBuyInQueue.clear();
    this.tableTimers.shutdown();
  }

  private runTableTask<T>(tableId: string, task: () => Promise<T>): Promise<T> {
    return this.tableTaskQueue.run(tableId, task);
  }

  private runSeatBuyInTask<T>(tableId: string, seatId: number, task: () => Promise<T>): Promise<T> {
    return this.seatBuyInQueue.run(`${tableId}:${seatId}`, task);
  }

  private now(): string {
    return this.deps.clock.nowIso();
  }

  private touchState(state: TableState): void {
    state.version += 1;
    state.updatedAt = this.now();
  }

  private clearSeatOwnership(seat: Seat): void {
    seat.userId = null;
    seat.stack = 0;
    seat.holeCards = null;
    seat.reservationId = undefined;
    seat.pendingBuyInAmount = undefined;
    seat.buyInIdempotencyKey = undefined;
  }

  private newIdempotencyKey(prefix: string): string {
    return `${prefix}:${this.deps.ids.randomUUID()}`;
  }

  private cashOutIdempotencyKey(tableId: string, userId: string, seatId: number): string {
    return this.newIdempotencyKey(`cashout:${tableId}:${userId}:${seatId}`);
  }

  private async cashOutSeatStack({
    tableId,
    userId,
    seatId,
    amount,
  }: {
    tableId: string;
    userId: string;
    seatId: number;
    amount: number;
  }): Promise<void> {
    const cashOutCall = await this.deps.balanceClient.processCashOut({
      accountId: userId,
      tableId,
      seatId,
      amount,
      idempotencyKey: this.cashOutIdempotencyKey(tableId, userId, seatId),
    });

    if (!cashOutCall.ok) {
      this.eventEmitter.emitDetached({
        tableId,
        handId: undefined,
        userId,
        seatId,
        type: GameEventType.BALANCE_UNAVAILABLE,
        payload: { action: 'CASH_OUT' },
      });
      return;
    }

    if (!cashOutCall.value.ok) {
      this.eventEmitter.emitDetached({
        tableId,
        handId: undefined,
        userId,
        seatId,
        type: GameEventType.CASHOUT_FAILED,
        payload: { amount },
      });
    }
  }

  private resolveSeatForUser(state: TableState, userId: string): Seat | undefined {
    return resolveSeatForUserInState(state, userId);
  }

  private getTurnTimeMetric(
    tableId: string,
    handId: string,
    seatId: number,
  ): TurnTimeMetric | null {
    return this.tableTimers.getTurnTimeMetric(tableId, handId, seatId);
  }

  private findNextActiveTurn(seats: Seat[], startSeatId: number): number | null {
    if (seats.length === 0) {
      return null;
    }

    const total = seats.length;
    const normalizedStart = ((startSeatId % total) + total) % total;

    for (let offset = 0; offset < total; offset += 1) {
      const seatId = (normalizedStart + offset) % total;
      const seat = seats[seatId];
      if (seat?.status === 'ACTIVE' && seat.userId) {
        return seatId;
      }
    }

    return null;
  }

  private async repairTurnIfNeeded(table: Table, state: TableState): Promise<TableState> {
    if (!state.hand) {
      return state;
    }

    const turnSeatId = state.hand.turn;
    const seat = state.seats[turnSeatId];
    if (seat?.status === 'ACTIVE' && seat.userId) {
      return state;
    }

    const nextTurn = this.findNextActiveTurn(state.seats, turnSeatId);
    if (nextTurn === null) {
      this.deps.logger.warn({ tableId: state.tableId, turnSeatId }, 'turn.repair.failed');
      return state;
    }

    state.hand.turn = nextTurn;
    this.touchState(state);
    await this.deps.tableStateStore.save(state);
    await this.deps.publisher.publishTableState(table, state);
    return state;
  }

  private normalizeBuyInAmount(tableConfig: TableConfig, buyInAmount: number): number {
    const startingStack = coerceNumber(tableConfig.startingStack, DEFAULT_STARTING_STACK);
    const normalizedBuyIn = buyInAmount > 0 ? buyInAmount : startingStack;
    return normalizedBuyIn > 0 ? normalizedBuyIn : DEFAULT_STARTING_STACK;
  }

  private async finalizeSeatJoin({
    tableId,
    seatId,
    userId,
    buyInAmount,
    okMetric,
  }: {
    tableId: string;
    seatId: number;
    userId: string;
    buyInAmount: number;
    okMetric: string;
  }): Promise<JoinSeatResponse> {
    const result = await this.finalizeReservedSeatJoin({
      tableId,
      seatId,
      userId,
      fallbackBuyInAmount: buyInAmount,
    });

    if (result.type === 'balance_unavailable') {
      await this.handleBalanceUnavailable({
        tableId,
        seatId,
        userId,
        buyInAmount,
        error: result.error,
      });
      this.deps.metrics.recordSeatJoin('ok', GameEventType.BALANCE_UNAVAILABLE);
      return { ok: true };
    }

    if (result.type === 'error') {
      this.deps.metrics.recordSeatJoin('error', result.error);
      return { ok: false, error: result.error };
    }

    this.deps.metrics.recordSeatJoin('ok', result.wasAlreadySeated ? 'IDEMPOTENT' : okMetric);
    return { ok: true };
  }

  async createTable(name: string, ownerId: string, configInput: TableConfig): Promise<Table> {
    const tableId = this.deps.ids.randomUUID();
    const createdAt = this.now();

    const table: Table = {
      tableId,
      name,
      ownerId,
      config: configInput,
      status: 'WAITING',
      createdAt,
    };

    const seats: Seat[] = Array.from({ length: configInput.maxPlayers }, (_, index) => ({
      seatId: index,
      userId: null,
      stack: 0,
      status: 'EMPTY',
      holeCards: null,
    }));

    const state: TableState = {
      tableId,
      seats,
      spectators: [],
      hand: null,
      button: 0,
      version: 0,
      updatedAt: createdAt,
    };

    await this.deps.tableStore.save(table);
    await this.deps.tableStateStore.save(state);
    await this.deps.publisher.publishTableAndLobby(table, state);
    return table;
  }

  async ensureMainTable(): Promise<void> {
    const tableIds = await this.deps.tableStore.list();
    if (tableIds.length === 0) {
      await this.createTable('Main Table', 'system', {
        smallBlind: 1,
        bigBlind: 2,
        ante: 0,
        maxPlayers: 9,
        startingStack: 200,
        turnTimerSeconds: 20,
      });
    }
  }

  async getTable(tableId: string): Promise<Table | null> {
    return this.deps.tableStore.get(tableId);
  }

  async listTableSummaries(): Promise<TableSummary[]> {
    const snapshot = await this.deps.publisher.getTableSummariesSnapshot();
    return snapshot.summaries;
  }

  async deleteTable(tableId: string): Promise<boolean> {
    return this.runTableTask(tableId, () => this.deleteTableUnlocked(tableId));
  }

  private async deleteTableUnlocked(tableId: string): Promise<boolean> {
    const table = await this.deps.tableStore.get(tableId);
    if (!table) {
      return false;
    }

    await this.deps.tableStore.delete(tableId, table.ownerId);
    await this.deps.tableStateStore.delete(tableId);
    await this.deps.publisher.publishLobbySnapshot();
    return true;
  }

  async getTableState(tableId: string, userId?: string): Promise<GetTableStateResponse | null> {
    const state = await this.deps.tableStateStore.get(tableId);
    if (!state) {
      return null;
    }

    if (state.hand && !this.tableTimers.hasTurnTimer(tableId)) {
      fireAndForget(
        () =>
          this.runTableTask(tableId, async () => {
            if (this.tableTimers.hasTurnTimer(tableId)) {
              return;
            }

            const loaded = await this.deps.tableQueries.loadTableAndState(tableId);
            if (!loaded) {
              return;
            }

            await this.tableTimers.startTurnTimer(loaded.table, loaded.state);
          }),
        (error: unknown) => {
          this.deps.logger.error({ err: error, tableId }, 'turn.timer.rearm.failed');
        },
      );
    }

    const seat = userId ? this.resolveSeatForUser(state, userId) : undefined;
    const holeCards: NonNullable<Seat['holeCards']> = seat?.holeCards ?? [];
    return { state: redactTableState(state), holeCards };
  }

  async joinSeat(
    tableId: string,
    userId: string,
    seatId: number,
    buyInAmount: number,
  ): Promise<JoinSeatResponse> {
    const prepared = await this.runTableTask(tableId, async () => {
      const loaded = await this.deps.tableQueries.loadTableAndState(tableId);
      if (!loaded) {
        this.deps.metrics.recordSeatJoin('error', 'TABLE_NOT_FOUND');
        return { type: 'done' as const, response: { ok: false, error: 'TABLE_NOT_FOUND' } };
      }

      const { table, state } = loaded;
      const finalBuyIn = this.normalizeBuyInAmount(table.config, buyInAmount);

      const chainResult = await this.joinSeatChain({
        tableId,
        userId,
        seatId,
        buyInAmount: finalBuyIn,
        table,
        state,
      });

      if (chainResult.type === 'done') {
        return { type: 'done' as const, response: chainResult.response };
      }

      return {
        type: 'finalize' as const,
        buyInAmount: finalBuyIn,
        okMetric: chainResult.okMetric,
      };
    });

    if (prepared.type === 'done') {
      return prepared.response;
    }

    return this.runSeatBuyInTask(tableId, seatId, () =>
      this.finalizeSeatJoin({
        tableId,
        seatId,
        userId,
        buyInAmount: prepared.buyInAmount,
        okMetric: prepared.okMetric,
      }),
    );
  }

  private async finalizeReservedSeatJoin({
    tableId,
    seatId,
    userId,
    fallbackBuyInAmount,
  }: {
    tableId: string;
    seatId: number;
    userId: string;
    fallbackBuyInAmount: number;
  }): Promise<FinalizeReservedSeatJoinResult> {
    return this.seatBuyInChain({
      tableId,
      seatId,
      userId,
      fallbackBuyInAmount,
    });
  }

  private async handleBalanceUnavailable({
    tableId,
    seatId,
    userId,
    buyInAmount,
    error,
  }: {
    tableId: string;
    seatId: number;
    userId: string;
    buyInAmount: number;
    error: unknown;
  }): Promise<void> {
    this.deps.logger.error({ err: error, tableId, seatId, userId }, 'Balance service unavailable');

    await this.runTableTask(tableId, async () => {
      const state = await this.deps.tableStateStore.get(tableId);
      if (!state) {
        return;
      }

      const seat = seatAt(state.seats, seatId);
      if (!seat || seat.userId !== userId) {
        return;
      }

      seat.stack = buyInAmount;
      seat.status = 'SEATED';
      seat.reservationId = undefined;
      seat.pendingBuyInAmount = undefined;
      seat.buyInIdempotencyKey = undefined;

      this.touchState(state);
      await this.deps.tableStateStore.save(state);

      this.eventEmitter.emitDetached({
        tableId,
        handId: undefined,
        userId,
        seatId,
        type: GameEventType.BALANCE_UNAVAILABLE,
        payload: {
          action: 'BUY_IN',
        },
      });

      const table = await this.deps.tableStore.get(tableId);
      if (!table) {
        return;
      }

      await this.deps.publisher.publishTableAndLobby(table, state);
      await this.handLifecycle.checkStartHand(table, state);
    });
  }

  private async rollbackSeat(
    tableId: string,
    seatId: number,
    userId: string,
    reservationId?: string,
  ): Promise<void> {
    if (reservationId) {
      fireAndForget(
        () =>
          this.deps.balanceClient.releaseReservation({
            reservationId,
            reason: 'buy_in_failed',
          }),
        (error: unknown) => {
          this.deps.logger.warn(
            { err: error, tableId, seatId, userId, reservationId },
            'balance.reservation.release.failed',
          );
        },
      );
    }

    await this.runTableTask(tableId, async () => {
      const state = await this.deps.tableStateStore.get(tableId);
      if (!state) {
        return;
      }

      const seat = seatAt(state.seats, seatId);
      if (!seat || seat.userId !== userId || seat.status !== 'RESERVED') {
        return;
      }

      this.clearSeatOwnership(seat);
      seat.status = 'EMPTY';
      this.touchState(state);
      await this.deps.tableStateStore.save(state);

      const table = await this.deps.tableStore.get(tableId);
      if (table) {
        await this.deps.publisher.publishTableAndLobby(table, state);
      }
    });
  }

  async leaveSeat(tableId: string, userId: string): Promise<OkResult | ErrorResult> {
    const result = await this.runTableTask(tableId, () => this.leaveSeatUnlocked(tableId, userId));
    if (!result.ok) {
      return result;
    }

    this.eventEmitter.emitDetached({
      tableId,
      handId: result.handId,
      userId,
      seatId: result.seatId,
      type: GameEventType.PLAYER_LEFT,
      payload: { stack: result.remainingStack },
    });

    if (result.remainingStack > 0) {
      await this.cashOutSeatStack({
        tableId,
        userId,
        seatId: result.seatId,
        amount: result.remainingStack,
      });
    }

    return { ok: true };
  }

  private async leaveSeatUnlocked(
    tableId: string,
    userId: string,
  ): Promise<LeaveSeatUnlockedResult> {
    return this.leaveSeatChain({ tableId, userId });
  }

  async joinSpectator(tableId: string, userId: string): Promise<OkResult | ErrorResult> {
    return this.runTableTask(tableId, () => this.joinSpectatorUnlocked(tableId, userId));
  }

  private async joinSpectatorUnlocked(
    tableId: string,
    userId: string,
  ): Promise<OkResult | ErrorResult> {
    const loaded = await this.deps.tableQueries.loadTableAndState(tableId);
    if (!loaded) {
      return { ok: false, error: 'TABLE_NOT_FOUND' };
    }

    const { table, state } = loaded;
    if (state.seats.some((seat) => seat.userId === userId)) {
      return { ok: true };
    }
    if (state.spectators.some((spectator) => spectator.userId === userId)) {
      return { ok: true };
    }

    state.spectators.push({ userId, status: 'ACTIVE', joinedAt: this.now() });
    this.touchState(state);
    await this.deps.tableStateStore.save(state);
    await this.deps.publisher.publishTableAndLobby(table, state);
    return { ok: true };
  }

  async leaveSpectator(tableId: string, userId: string): Promise<OkResult | ErrorResult> {
    return this.runTableTask(tableId, () => this.leaveSpectatorUnlocked(tableId, userId));
  }

  private async leaveSpectatorUnlocked(
    tableId: string,
    userId: string,
  ): Promise<OkResult | ErrorResult> {
    const loaded = await this.deps.tableQueries.loadTableAndState(tableId);
    if (!loaded) {
      return { ok: false, error: 'TABLE_NOT_FOUND' };
    }

    const { table, state } = loaded;
    state.spectators = state.spectators.filter((spectator) => spectator.userId !== userId);
    this.touchState(state);
    await this.deps.tableStateStore.save(state);
    await this.deps.publisher.publishTableAndLobby(table, state);
    return { ok: true };
  }

  async submitAction(
    tableId: string,
    userId: string,
    action: ActionInput,
  ): Promise<OkResult | ErrorResult> {
    return this.runTableTask(tableId, () => this.submitActionUnlocked(tableId, userId, action));
  }

  private async submitActionUnlocked(
    tableId: string,
    userId: string,
    action: ActionInput,
  ): Promise<OkResult | ErrorResult> {
    const loaded = await this.deps.tableQueries.loadTableAndState(tableId);
    if (!loaded) {
      return { ok: false, error: 'TABLE_NOT_FOUND' };
    }

    const { table, state } = loaded;
    if (!state.hand) {
      return { ok: false, error: 'NO_HAND_IN_PROGRESS' };
    }

    const actionStreet = state.hand.street;
    const handId = state.hand.handId;

    const seat = this.resolveSeatForUser(state, userId);
    if (!seat) {
      return { ok: false, error: 'PLAYER_NOT_AT_TABLE' };
    }

    const previousTotalContribution = state.hand.totalContributions[seat.seatId] ?? 0;

    const result = applyAction(state, seat.seatId, action, { allowInactive: true });
    if (!result.accepted) {
      return { ok: false, error: result.reason || 'INVALID_ACTION' };
    }

    await this.submitActionChain({
      tableId,
      userId,
      actionInput: action,
      actionStreet,
      table,
      actingSeat: seat,
      previousTotalContribution,
      turnTimeMetric: this.getTurnTimeMetric(tableId, handId, seat.seatId),
      result,
    });

    return { ok: true };
  }

}
