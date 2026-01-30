import { seatAt } from '../../domain/seats';
import { GameEventType, type GameEventType as GameEventTypeValue } from '../../domain/events';
import type { Table, TableState } from '../../domain/types';
import type {
  BalanceCall,
  CommitReservationParams,
  CommitResult,
  ReleaseReservationParams,
  ReleaseResult,
  ReserveForBuyInParams,
  ReserveResult,
} from '../../clients/balanceClient';
import { composeAsyncChain, type AsyncChainHandler } from '@specify-poker/shared/pipeline';
import { coerceNumber } from '../../utils/coerce';

export type FinalizeReservedSeatJoinResult =
  | { readonly type: 'ok'; readonly wasAlreadySeated?: boolean }
  | { readonly type: 'error'; readonly error: string }
  | { readonly type: 'balance_unavailable'; readonly error: unknown };

export type SeatBuyInChainContext = {
  readonly tableId: string;
  readonly seatId: number;
  readonly userId: string;
  readonly fallbackBuyInAmount: number;
  buyInAmount?: number;
  buyInIdempotencyKey?: string;
  reservationId?: string;
};

export type SeatBuyInChainDeps = {
  runTableTask<T>(tableId: string, task: () => Promise<T>): Promise<T>;
  loadTableState(tableId: string): Promise<TableState | null>;
  loadTable(tableId: string): Promise<Table | null>;
  touchState(state: TableState): void;
  saveState(state: TableState): Promise<void>;
  publishTableAndLobby(table: Table, state: TableState): Promise<void>;
  checkStartHand(table: Table, state: TableState): Promise<void>;
  newIdempotencyKey(prefix: string): string;
  reserveForBuyIn(params: ReserveForBuyInParams): Promise<BalanceCall<ReserveResult>>;
  commitReservation(params: CommitReservationParams): Promise<BalanceCall<CommitResult>>;
  releaseReservation(params: ReleaseReservationParams): Promise<BalanceCall<ReleaseResult>>;
  rollbackSeat(params: {
    tableId: string;
    seatId: number;
    userId: string;
    reservationId?: string;
  }): Promise<void>;
  emitGameEvent(params: {
    tableId: string;
    handId: string | undefined;
    userId: string | undefined;
    seatId: number | undefined;
    type: GameEventTypeValue;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<void>;
};

type SeatBuyInHandler = AsyncChainHandler<SeatBuyInChainContext, FinalizeReservedSeatJoinResult>;

function prepareSeat(deps: SeatBuyInChainDeps): SeatBuyInHandler {
  return async (ctx, next) => {
    type PrepareOutcome =
      | {
          readonly type: 'continue';
          readonly buyInAmount: number;
          readonly buyInIdempotencyKey: string;
          readonly reservationId?: string;
        }
      | FinalizeReservedSeatJoinResult;

    const prepared = await deps.runTableTask(ctx.tableId, async (): Promise<PrepareOutcome> => {
      const state = await deps.loadTableState(ctx.tableId);
      if (!state) {
        return { type: 'error', error: 'TABLE_LOST' };
      }

      const seat = seatAt(state.seats, ctx.seatId);
      if (!seat || seat.userId !== ctx.userId) {
        return { type: 'error', error: 'SEAT_LOST' };
      }

      if (seat.status !== 'RESERVED') {
        return { type: 'ok', wasAlreadySeated: true };
      }

      const pendingBuyInAmount = coerceNumber(seat.pendingBuyInAmount, ctx.fallbackBuyInAmount);
      const buyInAmount =
        pendingBuyInAmount > 0 ? pendingBuyInAmount : ctx.fallbackBuyInAmount;

      const buyInIdempotencyKey =
        seat.buyInIdempotencyKey ??
        deps.newIdempotencyKey(`buyin:${ctx.tableId}:${ctx.seatId}:${ctx.userId}`);

      if (!seat.buyInIdempotencyKey) {
        seat.buyInIdempotencyKey = buyInIdempotencyKey;
        seat.pendingBuyInAmount = buyInAmount;
        deps.touchState(state);
        await deps.saveState(state);
      }

      return {
        type: 'continue',
        buyInAmount,
        buyInIdempotencyKey,
        reservationId: seat.reservationId,
      };
    });

    if (prepared.type !== 'continue') {
      return prepared;
    }

    ctx.buyInAmount = prepared.buyInAmount;
    ctx.buyInIdempotencyKey = prepared.buyInIdempotencyKey;
    ctx.reservationId = prepared.reservationId;

    return next();
  };
}

function reserveBalanceIfNeeded(deps: SeatBuyInChainDeps): SeatBuyInHandler {
  return async (ctx, next) => {
    if (ctx.reservationId) {
      return next();
    }

    const buyInAmount = ctx.buyInAmount ?? ctx.fallbackBuyInAmount;
    const buyInIdempotencyKey = ctx.buyInIdempotencyKey;
    if (!buyInIdempotencyKey) {
      return { type: 'error', error: 'INTERNAL' };
    }

    const reservationCall = await deps.reserveForBuyIn({
      accountId: ctx.userId,
      tableId: ctx.tableId,
      amount: buyInAmount,
      idempotencyKey: buyInIdempotencyKey,
      timeoutSeconds: 30,
    });

    if (reservationCall.type === 'unavailable') {
      return { type: 'balance_unavailable', error: reservationCall.error };
    }

    const reservation = reservationCall.response;
    const reservationId = reservation.reservationId;
    if (!reservation.ok || !reservationId) {
      await deps.rollbackSeat({ tableId: ctx.tableId, seatId: ctx.seatId, userId: ctx.userId });
      return { type: 'error', error: reservation.error || 'INSUFFICIENT_BALANCE' };
    }

    const persistedReservation = await deps.runTableTask(
      ctx.tableId,
      async (): Promise<{ readonly type: 'ok' } | { readonly type: 'error'; readonly error: string }> => {
        const state = await deps.loadTableState(ctx.tableId);
        if (!state) {
          return { type: 'error', error: 'TABLE_LOST' };
        }

        const seat = seatAt(state.seats, ctx.seatId);
        if (!seat || seat.userId !== ctx.userId || seat.status !== 'RESERVED') {
          return { type: 'error', error: 'SEAT_LOST' };
        }

        seat.reservationId = reservationId;
        deps.touchState(state);
        await deps.saveState(state);
        return { type: 'ok' };
      },
    );

    if (persistedReservation.type === 'error') {
      void deps.releaseReservation({ reservationId, reason: 'seat_lost' });
      return persistedReservation;
    }

    ctx.buyInAmount = buyInAmount;
    ctx.reservationId = reservationId;

    return next();
  };
}

function commitBalanceReservation(deps: SeatBuyInChainDeps): SeatBuyInHandler {
  return async (ctx, next) => {
    const reservationId = ctx.reservationId;
    if (!reservationId) {
      return { type: 'error', error: 'INTERNAL' };
    }

    const commitCall = await deps.commitReservation({ reservationId });
    if (commitCall.type === 'unavailable') {
      return { type: 'balance_unavailable', error: commitCall.error };
    }

    const commit = commitCall.response;
    if (!commit.ok) {
      await deps.rollbackSeat({ tableId: ctx.tableId, seatId: ctx.seatId, userId: ctx.userId, reservationId });
      return { type: 'error', error: commit.error || 'COMMIT_FAILED' };
    }

    return next();
  };
}

function finalizeSeat(deps: SeatBuyInChainDeps): SeatBuyInHandler {
  return async (ctx, _next) => {
    const reservationId = ctx.reservationId;
    const buyInAmount = ctx.buyInAmount ?? ctx.fallbackBuyInAmount;
    const buyInIdempotencyKey = ctx.buyInIdempotencyKey;

    if (!reservationId || !buyInIdempotencyKey) {
      return { type: 'error', error: 'INTERNAL' };
    }

    const finalizeResult = await deps.runTableTask(
      ctx.tableId,
      async (): Promise<{ readonly type: 'ok' } | { readonly type: 'error'; readonly error: string }> => {
        const [table, state] = await Promise.all([
          deps.loadTable(ctx.tableId),
          deps.loadTableState(ctx.tableId),
        ]);
        if (!table || !state) {
          return { type: 'error', error: 'TABLE_LOST' };
        }

        const seat = seatAt(state.seats, ctx.seatId);
        if (!seat || seat.userId !== ctx.userId) {
          return { type: 'error', error: 'SEAT_LOST' };
        }

        seat.stack = buyInAmount;
        seat.status = 'SEATED';
        seat.reservationId = reservationId;
        seat.pendingBuyInAmount = undefined;
        seat.buyInIdempotencyKey = undefined;

        deps.touchState(state);
        await deps.saveState(state);
        await deps.publishTableAndLobby(table, state);

        void deps.emitGameEvent({
          tableId: ctx.tableId,
          handId: undefined,
          userId: ctx.userId,
          seatId: ctx.seatId,
          type: GameEventType.PLAYER_JOINED,
          payload: {
            stack: buyInAmount,
          },
          idempotencyKey: `event:${GameEventType.PLAYER_JOINED}:${buyInIdempotencyKey}`,
        });

        await deps.checkStartHand(table, state);

        return { type: 'ok' };
      },
    );

    if (finalizeResult.type === 'error') {
      return finalizeResult;
    }

    return { type: 'ok' };
  };
}

export function createSeatBuyInChain(
  deps: SeatBuyInChainDeps,
): (ctx: SeatBuyInChainContext) => Promise<FinalizeReservedSeatJoinResult> {
  const handlers: readonly SeatBuyInHandler[] = [
    prepareSeat(deps),
    reserveBalanceIfNeeded(deps),
    commitBalanceReservation(deps),
    finalizeSeat(deps),
  ];

  return composeAsyncChain(handlers, async () => ({ type: 'error', error: 'INTERNAL' }));
}

